import * as WebSocket from "ws";
import {IncomingMessage} from "http";
import {HiveClient} from "./hive-client";
import {
    ErrorMessage,
    InboundMessages,
    OutboundMessage,
    Payload,
    SessionCreatedMessage,
    SessionJoinedMessage
} from "./messages";
import {GameSession} from "./game-session";
import {GameConfig} from "./game-config";
import assert from "assert";
import Timeout = NodeJS.Timeout;

class HiveServer {
    readonly port: number;
    readonly wss: WebSocket.Server;

    /**
     * A map from client id to client.
     */
    clients: { [key: string]: HiveClient };
    /**
     * A map from session id to game sessions.
     */
    sessions: { [key: string]: GameSession };
    /**
     * An interval that pings clients to eliminate dead connections.
     */
    readonly pingInterval: Timeout;

    constructor(port: number) {
        this.port = port;
        this.wss = new WebSocket.Server({port: 8010});
        this.clients = {};
        this.sessions = {};
        this.wss.on('connection', this.onConnection.bind(this));
        this.pingInterval = setInterval(this.ping.bind(this), 30000);
        console.info('server up');
    }

    get clientCount(): number {
        return Object.keys(this.clients).length;
    }

    get sessionCount(): number {
        return Object.keys(this.sessions).length;
    }

    /**
     * Pings all client to determine which are still alive
     */
    ping() {
        for (let id in this.clients) {
            const client: HiveClient = this.clients[id];
            if (!client.isAlive) {
                client.terminate();
                return;
            }
            client.isAlive = false;
            client.socket.ping(() => {
            });
        }
    }

    /**
     * Handles new client connection
     */
    onConnection(ws: WebSocket, req: IncomingMessage) {
        // Obtain IP address from reverse proxy if setup
        let ip = (req.headers['x-forwarded-for'] || req.connection.remoteAddress) as string;

        // If an client has connected before and lost the connection afterwards,
        // if should provide the client id given to it to join the same session.
        let clientId = req.headers['client-id'] as string;
        let client = new HiveClient(ws, ip, clientId);

        // Register web socket on message cb.
        ws.onmessage = ((message: WebSocket.MessageEvent) => {
            // Arrow function uses this of its parent scope.
            this.onMessage(client, message);
        });

        // Register web socket on close cb.
        ws.onclose = (evt: WebSocket.CloseEvent) => this.onClose(client, evt);

        // Add client to list of clients
        this.clients[client.id] = client;
        console.info(`client ${client.id} connected (total ${this.clientCount})`);
    }

    /**
     * Handles incoming message from element.
     */
    onMessage(client: HiveClient, message: WebSocket.MessageEvent) {
        let data: Payload;
        try {
            data = JSON.parse(message.data as string) as Payload;
        } catch (e) {
            console.error('error parsing json obj\n\t' + message.data);
            client.send(ErrorMessage.invalidRequest);
            return;
        }
        const context = data['context'];
        switch (context) {
            case InboundMessages.newSession:
                let config = new GameConfig(data['playAsWhite'], data['includesMosquito'], data['includesLadybug']);
                this.createNewSession(client, config);
                break;
            case InboundMessages.destroySession:
                this.destroySession(client);
                break;
            case InboundMessages.joinSession:
                this.joinSession(client, data['sessionId']);
                break;
            case InboundMessages.leaveSession:
                this.leaveSession(client);
                break;
            default:
                client.send(ErrorMessage.invalidRequest);
                console.error('unknown message context from client: ' + context);
                break;
        }
    }

    /**
     * Removes {client} from its session and notify the peer.
     * Does not remove the session itself.
     * Initiator should call destroySession if it wants to leave the session.
     */
    leaveSession(client: HiveClient) {
        let session = client.session;
        if (session == null) {
            return;
        }
        assert(client === session.peer);
        delete session.peer;
        delete client.session;
        session.initiator.send(OutboundMessage.peerDisconnected);
        console.info(`client ${client.id} has left session ${session.id}`);
    }

    /**
     * Joins the client into a session.
     */
    joinSession(client: HiveClient, sessionId: string) {
        if (client.session != null && client.session.id != sessionId) {
            client.send(new ErrorMessage(
                'sessionExists',
                'Cannot Join Session',
                `Already in session ${client.session.id}, leave first`
            ));
            return;
        }
        let session = this.sessions[sessionId];
        client.session = session;
        if (session == null) {
            // If session does not exist, send an error.
            client.send(ErrorMessage.sessionNotFound);
            return;
        }
        if (session.peer == null) {
            console.info(`client ${client.id} joined session ${session.id} as peer`);
            session.peer = client;
        } else {
            console.info(`client ${client.id} joined session ${session.id} as initiator`);
            // Handles the situation where the initiator loses the connection and wants to reconnect.
            session.initiator = client;
        }
        let msg = new SessionJoinedMessage(session);
        console.log(msg.payload);
        session.peer?.send(msg);
        session.initiator.send(msg);
    }

    /**
     * Destroys the session that the client is in.
     * This happens when
     *  - the client has explicitly left
     *  - both peers of the session have disconnected.
     */
    destroySession(client: HiveClient) {
        const session = client.session;
        if (session == null) {
            return;
        }
        if (session.peer != null && session.peer.isAlive) {
            // Notify the peer that the session have been destroyed if it is still connected.
            session.peer.send(OutboundMessage.sessionDestroyed);
        }
        delete client.session;
        delete session.peer?.session;
        delete this.sessions[session.id];
        console.info('destroyed session ' + session.id + `(total ${this.sessionCount})`);
    }

    /**
     * Creates a new game session with a client as initiator.
     */
    createNewSession(initiator: HiveClient, gameConfig: GameConfig) {
        console.log(gameConfig);
        let session = new GameSession(initiator, this.genSessionId(), gameConfig);
        this.sessions[session.id] = session;
        initiator.session = session;
        initiator.send(new SessionCreatedMessage(session.id));
        console.info(`created new session ${session.id} (total ${this.sessionCount})`)
    }


    /**
     * Called when a client disconnects.
     */
    onClose(client: HiveClient, evt: WebSocket.CloseEvent) {
        delete this.clients[client.id];
        client.isAlive = false;
        if (client.session != null) {
            const session = client.session;

            // If one of the peers in the session disconnects unexpectedly, notify the other.
            if (client == session.initiator) {
                session.peer?.send(OutboundMessage.peerDisconnected);
            } else if (client == session.peer) {
                session.initiator.send(OutboundMessage.peerDisconnected);
            }

            // If both peers of the session left, destroy the session.
            if (session.initiator == null || !session.initiator.isAlive) {
                if (session.peer == null || !session.peer.isAlive) {
                    this.destroySession(client);
                }
            }
        }
        console.info(`client ${client.id} disconnected with code ${evt.code} (total ${this.clientCount})`);
    }

    /**
     * Generates a new game session id.
     */
    genSessionId(): string {
        let result = '';
        const characters = '0123456789';
        for (let i = 0; i < 6; i++) {
            result += characters.charAt(Math.floor(Math.random() * characters.length));
        }
        if (Object.keys(this.sessions).includes(result)) {
            // If session id already exists, try again.
            return this.genSessionId();
        }
        return result;
    }
}

export {HiveServer}