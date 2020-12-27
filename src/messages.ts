type Payload = { [key: string]: any };

/**
 * Outbound message from server to clients.
 */
abstract class OutboundMessage {
    public readonly context: string;
    public readonly payload: Payload;

    protected constructor(context: string, payload: Payload) {
        this.context = context;
        this.payload = payload;
    }

    public stringify(): string {
        let json: Payload = {
            context: this.context,
        };
        for (let key in this.payload) {
            if (!this.payload.hasOwnProperty(key)) {
                continue;
            }
            json[key] = this.payload[key];
        }
        return JSON.stringify(json);
    }
}

class HandshakeMessage extends OutboundMessage {
    constructor(clientId: string) {
        super('handshake', {
            clientId: clientId
        });
    }
}

/**
 * A message containing a new game session created for the client.
 */
class NewSessionMessage extends OutboundMessage {
    constructor(id: String) {
        super('newSession', {
            sessionId: id
        });
    }
}

/**
 * Inbound messages from client to server.
 */
abstract class InboundMessages {
    static newSession: string = 'newSession';
    static destroySession: string = 'destroySession';
}

export {OutboundMessage, HandshakeMessage, InboundMessages, Payload, NewSessionMessage}

