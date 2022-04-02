import { parallelPromiseLoop } from './parallelPromiseLoop'

type State = number;

export interface parallelPromiseArrayLoopOptions<Element> {
    iterateArray: Element[],
    statement: (element: Element, index: State, iterateArray: Element[]) => Promise<void>,
    
    maxThreads?: number,
    attempts?: number
}

export function parallelPromiseArrayLoop<Element>({
    iterateArray, statement, maxThreads = 1, attempts = 1
}: parallelPromiseArrayLoopOptions<Element>) {
    return parallelPromiseLoop<State>({
        initialization: () => 0,
        condition: index => index < iterateArray.length,
        finalExpression: index => index + 1,
        statement: (index) => statement(iterateArray[index], index, iterateArray),

        maxThreads,
        attempts,
    })
}