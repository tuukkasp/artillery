var faker = require('faker');
var base = require('./_baseProcessor');

module.exports = {
    doSomethingElse: (userContext, events, done) => {
        userContext.vars.something = "do";
        return done();
    },
    printStatus: base.printStatus,
    generateRandomData: base.generateRandomData
};