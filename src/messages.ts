import {GameSession} from "./game-session";

type Payload = { [key: string]: any };

/**
 * Outbound message from server to clients.
 */
class OutboundMessage {
    static peerDisconnected: OutboundMessage = new OutboundMessage('peerDisconnected');
    static sessionDestroyed: OutboundMessage = new OutboundMessage('sessionDestroyed');

    readonly context: string;
    readonly payload?: Payload;

    protected constructor(context: string, payload?: Payload) {
        this.context = context;
        this.payload = payload;
    }

    stringify(): string {
        let json: Payload = {
            context: this.context,
        };
        if (this.payload !== undefined) {
            for (let key in this.payload) {
                if (!this.payload.hasOwnProperty(key)) {
                    continue;
                }
                json[key] = this.payload[key];
            }
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

class SessionCreatedMessage extends OutboundMessage {
    constructor(id: String) {
        super('sessionCreated', {
            sessionId: id
        });
    }
}

class SessionJoinedMessage extends OutboundMessage {
    constructor(session: GameSession, forPeer = false) {

        super('sessionJoined', {
            sessionId: session.id,
            // Invert player role for peer since game config is with respect to the initiator.
            config: {
                playAsWhite: forPeer !== session.gameConfig.playAsWhite,
                armory: session.gameConfig.armory,
            },
        });
    }
}

class ErrorMessage extends OutboundMessage {
    static sessionNotFound: ErrorMessage = new ErrorMessage('sessionNotFound', 'Session Not Found');
    static invalidRequest: ErrorMessage = new ErrorMessage('invalidRequest', 'Invalid Request');
    static sessionFull: ErrorMessage = new ErrorMessage('sessionFull', 'Session Full');

    constructor(error: string, title: string, errMsg?: string) {
        super('error', {
            error: error,
            title: title,
            errMsg: errMsg
        });
    }
}

/**
 * Inbound messages from client to server.
 */
abstract class InboundMessages {
    static newSession: string = 'newSession';
    static destroySession: string = 'destroySession';
    static joinSession: string = 'joinSession';
    static leaveSession: string = 'leaveSession';
    static p2p: string = 'p2p';
}

export {
    OutboundMessage,
    HandshakeMessage,
    InboundMessages,
    Payload,
    SessionCreatedMessage,
    SessionJoinedMessage,
    ErrorMessage,
}

