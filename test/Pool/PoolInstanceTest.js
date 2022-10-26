const { initAttempts, random, randomSleep } = require('./utils');

const maxTrySymbol = Symbol('maxTrySymbol')

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

            if (taskContent.maxTry) {
                if (!(maxTrySymbol in taskContent))
                    taskContent[maxTrySymbol] = taskContent.maxTry;
                taskContent[maxTrySymbol]--;
                if (taskContent[maxTrySymbol]) {
                    throw new Error('We should try once more for success')
                }
                delete taskContent[maxTrySymbol];
            }

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
