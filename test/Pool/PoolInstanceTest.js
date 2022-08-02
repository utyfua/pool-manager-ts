const { initAttempts, random, randomSleep } = require('./utils');

function PoolInstanceTestBuilder(classObj) {
    class PoolInstanceTest extends classObj {
        testInitAttempts = random(-5, initAttempts);
        async start() {
            await randomSleep()
            this.testInitAttempts--;
            if (this.testInitAttempts <= 0) {
                return;
            }
            throw new Error('Init error test');
        }
        async executeTask({ taskContent }) {
            if (this.testInitAttempts > 0)
                throw new Error('Startup did not success first')
            await randomSleep();
            if ('index' in taskContent) {
                return taskContent;
            } else {
                throw taskContent.error
            }
        }
    }
    return PoolInstanceTest;
}

exports.PoolInstanceTestBuilder = PoolInstanceTestBuilder;
