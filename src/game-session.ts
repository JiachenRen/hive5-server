import {HiveClient} from "./hive-client";
import {GameConfig} from "./game-config";

class GameSession {
    initiator: HiveClient;
    peer?: HiveClient;
    id: string;

    /**
     * Game configuration with respect to the initiator
     */
    gameConfig: GameConfig;

    constructor(initiator: HiveClient, id: string, gameConfig: GameConfig) {
        this.gameConfig = gameConfig;
        this.initiator = initiator;
        this.id = id;
    }
}

export {GameSession}