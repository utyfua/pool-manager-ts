
export type PossiblyErrorObjectifyType<Result = any> = {
    type: 'result',
    result: Result
} | {
    type: 'error',
    error: any,
    isRealErrorObject?: boolean
}


export async function possiblyErrorObjectifyPromise<Result = any>(handler: (() => Promise<any>) | Promise<any>): Promise<PossiblyErrorObjectifyType<Result>> {
    try {
        return possiblyErrorObjectify<Result>({
            result: handler instanceof Function ? await handler() : await handler
        })
    } catch (error) {
        return possiblyErrorObjectify({ error })
    }
}

export function possiblyErrorObjectify<Result = any>(input: { result: any } | { error: any }): PossiblyErrorObjectifyType<Result> {
    if ('result' in input)
        return {
            type: 'result',
            result: input.result,
        };
    if (input.error instanceof Error) {
        return {
            type: 'error',
            error: input.error.stack,
            isRealErrorObject: true,
        }
    } else {
        return {
            type: 'error',
            error: input.error,
        }
    }
}

export function possiblyErrorPlainParse<Result extends any = any>(
    input: PossiblyErrorObjectifyType<Result>,
    { doNotThrow }: { doNotThrow?: boolean } = {}
): Result {
    if (input.type === 'result') return input.result;

    const error = input.isRealErrorObject ? new Error(input.error) : input.error
    if (doNotThrow) return error
    throw error
}
