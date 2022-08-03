
export interface RpcMessageBase {
    rpcId: string,
    rpcMessageId: string,
}
export interface RpcMessageRequest extends RpcMessageBase {
    action: 'request';
    message: any,
}
export interface RpcMessageResponse extends RpcMessageBase {
    action: 'response';
    message: {
        type: 'result',
        result: any
    } | {
        type: 'error',
        error: any,
        isErrorObject?: boolean
    },
}

export type RpcMessage = RpcMessageRequest | RpcMessageResponse

export interface RpcManagerDestination {
    send(message: RpcMessage): void
    on(eventName: 'message', handler: (rpcMessage: RpcMessage) => void): void
    on(eventName: 'close', handler: () => void): void
    on(eventName: 'error', handler: () => void): void
    off(eventName: 'message', handler: (rpcMessage: RpcMessage) => void): void
    off(eventName: 'close', handler: () => void): void
    off(eventName: 'error', handler: () => void): void
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
                        isErrorObject: true,
                    }
                } else {
                    responseMessage.message = {
                        type: 'error',
                        error,
                    }
                }
            }
            this.send(responseMessage);
        }

        if (message.action === 'response') {
            const callbacks = this.responseCallbacks[message.rpcMessageId];
            delete this.responseCallbacks[message.rpcMessageId];
            const response = message.message;
            if (response.type === 'result')
                callbacks.response(response.result);
            else {
                let error = response.error;
                if (response.isErrorObject) error = new Error(error)
                callbacks.reject(error);
            }
        }
    }

    responseCallbacks: Record<string, {
        response: (response: any) => any,
        reject: (error: Error) => void
    }> = {};
    async request<Response = any>(message: any): Promise<Response> {
        const requestMessage: RpcMessage = {
            rpcId: this.options.rpcId,
            rpcMessageId: this.getNewId(),
            action: 'request',
            message
        }
        this.send(requestMessage);
        return new Promise((response, reject) => {
            this.responseCallbacks[requestMessage.rpcMessageId] = { response, reject }
        })
    }

    send(message: RpcMessage) {
        return this.options.destination.send(message);
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
            .forEach(({ reject }) => reject(new Error('Destination was closed')))
    }
}
