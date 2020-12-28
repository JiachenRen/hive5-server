import * as WebSocket from "ws";
import {v4} from 'uuid';
import {GameSession} from "./game-session";
import {HandshakeMessage, OutboundMessage} from "./messages";


class HiveClient {
    readonly socket: WebSocket;
    readonly id: string;
    readonly ip: string;
    isAlive: boolean;
    session?: GameSession;

    get shortId(): string {
        return this.id.substring(0, 6);
    }

    constructor(socket: WebSocket, ip: string, id?: string) {
        this.socket = socket;
        this.isAlive = true;
        this.ip = ip;
        this.id = id ?? v4();
        socket.on('pong', this.heartbeat.bind(this));

        // Send back handshake message upon initialization
        this.send(new HandshakeMessage(this.id));
    }

    heartbeat() {
        this.isAlive = true;
    }

    send(message: OutboundMessage) {
        this.socket.send(message.stringify());
    }

    terminate() {
        console.info(`client ${this.shortId} terminated due to inactivity`);
        this.socket.terminate();
    }
}

export {HiveClient}