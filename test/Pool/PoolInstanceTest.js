const { poolInitAttempts, random, randomSleep } = require('./utils');

const maxTryMap = new Map()

function PoolInstanceTestBuilder(classObj) {
    class PoolInstanceTest extends classObj {
        testInitAttempts = random(-5, poolInitAttempts);
        async start() {
            await randomSleep()
            this.testInitAttempts--;
            if (this.testInitAttempts <= 0) {
                this.started = true;
                return;
            }
            throw new Error('Init error test');
        }
        async executeTask({ taskContent }) {
            if (!this.started)
                throw new Error('We should be started for now!')
            if (this.testInitAttempts > 0)
                throw new Error('Startup did not success first')
            await randomSleep();

            if (taskContent.maxTry) {
                let tryLeft = maxTryMap.get(taskContent)
                if (tryLeft === undefined) tryLeft = taskContent.maxTry;
                tryLeft--;
                maxTryMap.set(taskContent, tryLeft)
                if (tryLeft > 0) {
                    throw new Error('We should try once more for success')
                }
                if (tryLeft)
                    return { error: 'should not be here!' }
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
