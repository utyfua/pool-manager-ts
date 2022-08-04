export interface RpcMessageBase {
    rpcId: string,
    rpcMessageId: string,
}
export interface RpcMessageRequest extends RpcMessageBase {
    action: 'request';
    message: any,
}

export interface RpcMessageResponseMessageResult {
    type: 'result',
    result: any
}

export interface RpcMessageResponseMessageError {
    type: 'error',
    error: any,
    isPlainObject?: boolean
}

export type RpcMessageResponseMessage = RpcMessageResponseMessageResult | RpcMessageResponseMessageError;

export interface RpcMessageResponse extends RpcMessageBase {
    action: 'response';
    message: RpcMessageResponseMessage,
}

export type RpcMessage = RpcMessageRequest | RpcMessageResponse

export interface RpcManagerDestination {
    send(message: RpcMessage): void
    on(eventName: 'message', handler: (rpcMessage: RpcMessage) => void): void
    on(eventName: 'close', handler: () => void): void
    on(eventName: 'error', handler: () => void): void
    on(eventName: 'spawn', handler: () => void): void
    off(eventName: 'message', handler: (rpcMessage: RpcMessage) => void): void
    off(eventName: 'close', handler: () => void): void
    off(eventName: 'error', handler: () => void): void
    off(eventName: 'spawn', handler: () => void): void
}

export interface RpcManagerOptions {
    destination: RpcManagerDestination;
    rpcId: string;
    handler: (message: any) => Promise<any> | any
}

export class RpcManager {
    lastId: number = 0;
    getNewId() {
        if (this.lastId > 1000) this.lastId = 0;
        this.lastId++;
        return `rpcMessageId-${this.lastId}-${Date.now()}`;
    }

    constructor(public options: RpcManagerOptions) {
        const { destination } = options
        this.messageHandler = this.messageHandler.bind(this);
        this.closeHandler = this.closeHandler.bind(this);
        destination.on('message', this.messageHandler)
        destination.on('close', this.closeHandler)
        destination.on('error', this.closeHandler)
    }

    waitSpawn(): Promise<void> {
        return new Promise((resolve, reject) => {
            const destination = this.options.destination
            function clean(next: () => void) {
                destination.off('spawn', onSpawn)
                destination.off('error', onError)
                next();
            }
            const onSpawn = () => clean(resolve);
            const onError = () => clean(reject);
            destination.on('spawn', onSpawn)
            destination.on('error', onError)
        })
    }

    async messageHandler(message: RpcMessage) {
        // ignore message if we cant detect our identification
        if (typeof message !== 'object' || message.rpcId !== this.options.rpcId) return;

        if (message.action === 'request') {
            const resultMessage = {
                type: 'result' as 'result',
                result: null
            }
            const responseMessage: RpcMessage = {
                rpcId: this.options.rpcId,
                rpcMessageId: message.rpcMessageId,
                action: 'response',
                message: resultMessage
            }
            try {
                resultMessage.result = await this.options.handler(message.message)
            } catch (error) {
                if (error instanceof Error) {
                    responseMessage.message = {
                        type: 'error',
                        error: error.stack,
                    }
                } else {
                    responseMessage.message = {
                        type: 'error',
                        error,
                        isPlainObject: true,
                    }
                }
            }
            this.options.destination.send(responseMessage);
        }

        if (message.action === 'response') {
            const callback = this.responseCallbacks[message.rpcMessageId];
            delete this.responseCallbacks[message.rpcMessageId];
            callback(message.message);
        }
    }

    responseCallbacks: Record<string, (message: RpcMessageResponseMessage) => void> = {};
    async request<Response = any>(message: any): Promise<Response> {
        const destination = this.options.destination;
        const requestMessage: RpcMessage = {
            rpcId: this.options.rpcId,
            rpcMessageId: this.getNewId(),
            action: 'request',
            message
        }

        destination.send(requestMessage);
        const response = await new Promise<RpcMessageResponseMessage>((response) => {
            this.responseCallbacks[requestMessage.rpcMessageId] = response
        })

        if (response.type === 'result')
            return response.result;
        else {
            let error = response.error;
            if (!response.isPlainObject) error = new Error(error)
            throw error;
        }
    }

    closeHandler() {
        this.destroy();
    }
    destroy() {
        const destination = this.options.destination
        destination.off('message', this.messageHandler)
        destination.off('close', this.closeHandler)
        destination.off('error', this.closeHandler)

        const responseCallbacks = this.responseCallbacks;
        this.responseCallbacks = {};
        Object.values(responseCallbacks)
            .forEach((callback) => callback({
                type: 'error',
                error: new Error('Destination was closed'),
            }))
    }
}
