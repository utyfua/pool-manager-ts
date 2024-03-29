import { describe, expect, beforeEach, test, afterEach } from '@jest/globals';

import { PoolManager, PoolInstance, PoolTaskOptions, ProcessPoolInstance } from '../../dist/'
import { shuffleArray } from '../utils';
import { PoolInstanceTestBuilder } from './PoolInstanceTest.js';
import { poolInitAttempts } from './utils.js'

type TaskInput = { index: number } | { error: string }
// @ts-ignore
const PoolInstanceTest: typeof PoolInstance = PoolInstanceTestBuilder(PoolInstance)

function testPoolFlow({
    taskGeneralExecuteAttempts,
    poolCount,
    flowName,
    getClassConstructor,
}: {
    taskGeneralExecuteAttempts: number,
    poolCount: number,
    flowName: string,
    getClassConstructor: (options: { manager: PoolManager }) => PoolInstance,
}) {
    let testName = `${flowName} flow with ${poolCount} pools`;
    if (taskGeneralExecuteAttempts) testName += ' taskGeneralExecuteAttempts=' + taskGeneralExecuteAttempts;
    describe(testName, () => {
        let poolManager: PoolManager;

        function getTaskCount(dem: number = 1) {
            return (poolCount || 1) * 15 / dem;
        }

        async function executeTasks(tasks: TaskInput[], taskOptions?: PoolTaskOptions) {
            const responses = await Promise.all(tasks.map(task => {
                const taskMut = JSON.parse(JSON.stringify(task))
                return poolManager.proceedRawTask(taskMut, taskOptions).promise;
            }));
            for (let index in tasks) {
                const task = tasks[index];
                const result = responses[index].slice(0, 2);
                if ('index' in task) {
                    expect(result).toEqual([null, task]);
                } else {
                    expect(result).toEqual([task.error, null]);
                }
            }
        }

        function prepareTasks<T>(count: number, generator: (index: number) => T): T[] {
            return 'a'.repeat(count).split('').map((_, index) => generator(index))
        }

        beforeEach(async () => {
            poolManager = new PoolManager({
                poolInitAttempts,
                taskGeneralExecuteAttempts,
                poolInitQueueSize: Math.floor(Math.sqrt(poolCount)),
            })

            const pools = 'a'.repeat(poolCount).split('').map(() => getClassConstructor({ manager: poolManager }));
            await poolManager.startPools({
                pools,
            })
            expect(pools.map(pool => pool.getStateSync().error).filter(stateError => stateError)).toEqual([])
        })

        test(`${getTaskCount()} success tasks`, async () => {
            const tasks: TaskInput[] = prepareTasks(getTaskCount(), index => ({ index }));
            await executeTasks(tasks);
        })

        test(`${getTaskCount()} error tasks`, async () => {
            const tasks: TaskInput[] = prepareTasks(getTaskCount(), index => ({ error: `Error no ${index}` }));
            await executeTasks(tasks);
        })

        test(`${getTaskCount()} mixed tasks`, async () => {
            const tasks: TaskInput[] = [
                ...prepareTasks(getTaskCount(2), index => ({ index })),
                ...prepareTasks(getTaskCount(2), index => ({ error: `Error no ${index}` }))
            ];
            shuffleArray(tasks);
            await executeTasks(tasks);
        })

        // test does not work properly with child process
        if (flowName === 'base')
            test(`${getTaskCount()} mixed tasks should succeed`, async () => {
                const tasks: TaskInput[] = prepareTasks(getTaskCount(), index => ({
                    index,
                    maxTry: Math.ceil(Math.random() * taskGeneralExecuteAttempts)
                }))
                shuffleArray(tasks);
                await executeTasks(tasks);
            })

        afterEach(async () => {
            expect(poolManager.freePools.length).toBe(poolCount)

            poolManager.poolList.forEach(pool => {
                // @ts-ignore
                pool.close && pool.close()
            })
        })
    })
}

const testLevels = {
    flowParamsList: [
        {
            flowName: 'base',
            getClassConstructor({ manager }: { manager: PoolManager }): PoolInstance {
                return new PoolInstanceTest({ manager });
            },
        },
        {
            flowName: 'child process',
            getClassConstructor({ manager }: { manager: PoolManager }): PoolInstance {
                return new ProcessPoolInstance({
                    manager,
                    forkModulePath: 'test/Pool/childProcess.js'
                })
            },
        },
        {
            flowName: 'child process treeKill',
            getClassConstructor({ manager }: { manager: PoolManager }): PoolInstance {
                return new ProcessPoolInstance({
                    manager,
                    forkModulePath: 'test/Pool/childProcess.js',
                    killMode: 'treeKill',
                })
            },
        },
    ],
    poolCountList: [
        1,
        2,
    ],
    taskGeneralExecuteAttemptsList: [
        1,
        3,
    ],
}

testLevels.flowParamsList.forEach(flowParams => {
    testLevels.poolCountList.forEach(poolCount => {
        testLevels.taskGeneralExecuteAttemptsList.forEach(taskGeneralExecuteAttempts => {
            testPoolFlow({
                taskGeneralExecuteAttempts,
                poolCount,
                ...flowParams
            })
        })
    })
})
