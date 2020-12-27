import * as WebSocket from "ws";
import {IncomingMessage} from "http";
import {HiveClient} from "./hive-client";
import {InboundMessages, NewSessionMessage, Payload} from "./messages";
import {GameSession} from "./game-session";
import {GameConfig} from "./game-config";
import Timeout = NodeJS.Timeout;

class HiveServer {
    readonly port: number;
    readonly wss: WebSocket.Server;

    /**
     * Map from client id to client
     */
    clients: { [key: string]: HiveClient };

    /**
     * Map from session id to game sessions
     */
    sessions: { [key: string]: GameSession };

    /**
     * An interval that pings clients to eliminate dead connections
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
        console.info(`client ${client.id} connected (total ${Object.keys(this.clients).length})`);
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
            // Todo: notify client of JSON parse error.
            return;
        }
        const context = data['context'];
        switch (context) {
            case InboundMessages.newSession:
                this.createNewSession(client, data);
                break;
            case InboundMessages.destroySession:
                this.destroySession(client);
                break;
            default:
                console.error('unknown message context from client: ' + context);
                break;
        }

    }

    /**
     * Destroys the session that the client is in
     */
    destroySession(client: HiveClient) {
        const session = client.session;
        if (session == null) {
            return;
        }
        // Todo: tell peer that the session has been destroyed
        delete client.session;
        delete session.peer?.session;
        delete this.sessions[session.id];
        console.info('destroyed session ' + session.id + `(total ${Object.keys(this.sessions).length})`);
    }

    /**
     * Creates a new game session with a client as initiator.
     */
    createNewSession(initiator: HiveClient, data: Payload) {
        let gameConfig = new GameConfig(data['playAsWhite'], data['includesMosquito'], data['includesLadybug']);
        let session = new GameSession(initiator, this.genSessionId(), gameConfig);
        this.sessions[session.id] = session;
        initiator.session = session;
        initiator.send(new NewSessionMessage(session.id));
        console.info(`created new session ${session.id} (total ${Object.keys(this.sessions).length})`)
    }


    /**
     * Called when this client disconnects.
     */
    onClose(client: HiveClient, evt: WebSocket.CloseEvent) {
        delete this.clients[client.id];
        client.isAlive = false;
        if (client.session != null) {
            // If both peers of the session left, destroy the session.
            const session = client.session;
            if (session.initiator == null || !session.initiator.isAlive) {
                if (session.peer == null || !session.peer.isAlive) {
                    this.destroySession(client);
                }
            }
        }
        console.info(`client ${client.id} disconnected with code ${evt.code} (total ${Object.keys(this.clients).length})`);
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