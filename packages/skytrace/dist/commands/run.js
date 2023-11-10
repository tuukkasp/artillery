"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const Core = require("@artilleryio/int-core");
const EventEmitter = require("node:events");
const fs = require("node:fs");
const path = require("node:path");
const node_util_1 = require("node:util");
const command_1 = require("@oclif/command");
const YAML = require("js-yaml");
const artillery_plugin_expect_1 = require("artillery-plugin-expect");
const gradientString = require("gradient-string");
const telemetry = require("../telemetry");
class RunCommand extends command_1.Command {
    async runFlow(flowFilePath, opts) {
        var _a, _b, _c;
        const HttpEngine = Core.engine_http;
        const contents = YAML.loadAll(fs.readFileSync(flowFilePath, 'utf8'));
        const showHttpTimings = opts.showHTTPTimings || ((_a = contents[0].http) === null || _a === void 0 ? void 0 : _a.timings) === true;
        let script;
        if (typeof contents[0]['scenarios'] !== 'undefined') {
            // This is a classic Artillery script with config and scenario in the same file
            const target = ((_b = contents[0]['config']) === null || _b === void 0 ? void 0 : _b.target) || opts.target;
            script = {
                config: {
                    target,
                    plugins: {
                        expect: {
                            formatter: 'silent',
                            expectDefault200: true
                        }
                    }
                },
                scenarios: [contents[0]['scenarios'][0]]
            };
        }
        else {
            // This is a Skytrace scenario - just steps with metadata at the top
            script = {
                config: {
                    target: contents[0].target,
                    plugins: {
                        expect: {
                            formatter: 'silent',
                            expectDefault200: true
                        }
                    }
                },
                scenarios: [
                    {
                        name: contents[0].name,
                        flow: contents[1]
                    }
                ]
            };
        }
        const events = new EventEmitter();
        process.env.LOCAL_WORKER_ID = '1337';
        const plugin = new artillery_plugin_expect_1.Plugin(script, events);
        const engine = new HttpEngine(script);
        const vu = (0, node_util_1.promisify)(engine.createScenario(script.scenarios[0], events));
        const initialContext = {
            vars: {
                target: ((_c = script.config) === null || _c === void 0 ? void 0 : _c.target) || script.target,
                $environment: script._environment,
                $processEnvironment: process.env,
                $env: process.env,
                $testRunId: global.artillery.testRunId,
            }
        };
        events.on('error', (errCode, uuid) => { });
        events.on('trace:http:request', (requestParams, uuid) => { });
        events.on('trace:http:response', (resp, uuid) => { });
        events.on('trace:http:capture', (result) => { });
        events.on('plugin:expect:expectations', (expectations, req, res, userContext) => {
            var _a;
            artillery_plugin_expect_1.formatters.pretty(expectations, req, res, userContext);
            if (showHttpTimings) {
                const phases = (_a = res === null || res === void 0 ? void 0 : res.timings) === null || _a === void 0 ? void 0 : _a.phases;
                if (phases) {
                    console.log();
                    console.log(`  time: total=${phases.total} | dns=${phases.dns} | tcp=${phases.tcp} | ssl: ${phases.ssl || 'n/a'} | ttfb=${phases.firstByte} | download=${phases.download}`);
                }
            }
            console.log();
        });
        try {
            const context = await vu(initialContext);
        }
        catch (vuErr) {
            // console.log(vuErr);
        }
    }
    async run() {
        const { flags, argv, args } = this.parse(RunCommand);
        const flowFilePaths = [path.resolve(process.cwd(), argv[0])];
        const banner = `    ───━━━★
SKYTRACE ──━━★
      ──━━★`;
        console.log(gradientString.vice(banner));
        console.log();
        const opts = { target: flags.target, showHTTPTimings: flags.timings };
        const ping = telemetry.init();
        await ping.capture('run-flow', {
            cliTarget: flags.target,
            cliHTTPTimings: flags.timings,
        });
        if (flags.reload) {
            console.log('> Running flow (reload mode on)');
            console.log();
            this.runFlow(flowFilePaths[0], opts);
            let prevMtime = new Date(0);
            let rerunning = false;
            fs.watch(flowFilePaths[0], {}, (eventType, fn) => {
                if (!fn) {
                    return;
                }
                const stat = fs.statSync(fn);
                if (stat.mtime.valueOf() === prevMtime.valueOf()) {
                    return;
                }
                if (rerunning) {
                    return;
                }
                prevMtime = stat.mtime;
                rerunning = true;
                console.log();
                console.log('  --------------');
                console.log('> Rerunning flow');
                console.log(' ', new Date());
                console.log('  --------------');
                this.runFlow(flowFilePaths[0], opts);
                console.log();
                rerunning = false;
            });
        }
        else {
            console.log('> Running flow');
            // console.log('source:', flowFilePath);
            console.log('');
            await this.runFlow(flowFilePaths[0], opts);
        }
        await ping.shutdown();
    }
}
RunCommand.aliases = ['test'];
RunCommand.strict = false;
RunCommand.description = `Run flows`;
RunCommand.flags = {
    reload: command_1.flags.boolean({
        char: 'r',
        description: 'reload and rerun flow automatically'
    }),
    target: command_1.flags.string({
        char: 't',
        description: 'target endpoint, e.g. https://api.example-pet-store.com'
    }),
    timings: command_1.flags.boolean({
        description: 'show HTTP timing information for each request'
    })
};
RunCommand.args = [
    {
        name: 'file',
        required: true,
        description: 'Path to flow files'
    }
];
module.exports = { RunCommand };
