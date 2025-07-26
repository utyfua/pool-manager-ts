import { describe, expect, beforeEach, test, afterEach } from '@jest/globals';

import { PoolManager, PoolInstance, PoolTaskOptions, ProcessPoolInstance } from '../../dist/'
import { shuffleArray } from '../utils';
import { PoolInstanceTestBuilder } from './PoolInstanceTest.js';
import { poolInitAttempts } from './utils.js'

type TaskInput = { index: number } | { error: string }
type CrushErrorStage = 'fork' | 'start'
type ClassConstructorOptions = {
    manager: PoolManager,
    crushErrorStage?: CrushErrorStage,
};

function testPoolStart({
    flowName,
    getClassConstructor,
    crushErrorStage,
}: {
    flowName: string,
    getClassConstructor: (options: ClassConstructorOptions) => PoolInstance,
    crushErrorStage: CrushErrorStage,
}) {
    describe(`${flowName} flow ${crushErrorStage}`, () => {
        test(`${flowName} flow ${crushErrorStage} with error`, async () => {
            // base flow does not have fork error
            if (flowName === 'base' && crushErrorStage === 'fork') return;

            // @ts-ignore
            const poolInitOnError = jest.fn((error, pool) => {
                expect(error).toBeInstanceOf(Error);
                if (crushErrorStage === 'start') {
                    expect(error.message.includes('Start error test')).toBeTruthy();
                } else if (crushErrorStage === 'fork') {
                    console.log({ error })
                    expect(error.message.includes('Fork error test')).toBeTruthy();
                } else {
                    throw new Error('Unknown crushErrorStage');
                }
                expect(pool).toBeInstanceOf(PoolInstance);
            })
            const poolManager = new PoolManager({
                poolInitAttempts: 1,
                poolInitOnError,
            })
            const poolInstance = getClassConstructor({ manager: poolManager, crushErrorStage });
            const result = await poolManager.startPools({
                pools: [poolInstance],
            }).then(() => {
                return 'resolved';
            }).catch((error) => {
                expect(error).toBeInstanceOf(Error);
                expect(error.message).toBe("No pools are available");

                const errorState = poolInstance.getStateSync().error;
                expect(errorState).toBeTruthy();
                expect(errorState.message.includes('Start error test')).toBeTruthy();
                expect(poolInitOnError).toHaveBeenCalled();

                return 'rejected';
            })
            expect(result).toBe('rejected');

            poolManager.poolList.forEach(pool => pool.kill());
        })
    })
}

function testPoolFlow({
    flowName,
    getClassConstructor,
    taskGeneralExecuteAttempts,
    poolCount,
}: {
    flowName: string,
    getClassConstructor: (options: { manager: PoolManager }) => PoolInstance,
    taskGeneralExecuteAttempts: number,
    poolCount: number,
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

function getForkArgs(options: ClassConstructorOptions) {
    const args: string[] = [
        '--gc'
    ];

    if (options.crushErrorStage) {
        args.push('crushErrorStage=' + options.crushErrorStage);
    }

    return args;
}

const testLevels = {
    flowParamsList: [
        {
            flowName: 'base',
            getClassConstructor(options: ClassConstructorOptions): PoolInstance {
                // @ts-ignore
                const PoolInstanceTest: typeof PoolInstance = PoolInstanceTestBuilder(PoolInstance, { crushErrorStage: options.crushErrorStage });
                return new PoolInstanceTest({ manager: options.manager });
            },
        },
        {
            flowName: 'child process',
            getClassConstructor(options: ClassConstructorOptions): PoolInstance {
                return new ProcessPoolInstance({
                    manager: options.manager,
                    forkModulePath: 'test/Pool/childProcess.js',
                    forkArgs: getForkArgs(options),
                })
            },
        },
        {
            flowName: 'child process treeKill',
            getClassConstructor(options: ClassConstructorOptions): PoolInstance {
                return new ProcessPoolInstance({
                    manager: options.manager,
                    forkModulePath: 'test/Pool/childProcess.js',
                    killMode: 'treeKill',
                    forkArgs: getForkArgs(options),
                })
            },
        },
    ],
    crushErrorStageList: [
        // todo: fork test
        // 'fork',
        'start',
    ] as const,
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
    testLevels.crushErrorStageList.forEach(crushErrorStage => {
        testPoolStart({
            crushErrorStage,
            ...flowParams,
        })
    })
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
