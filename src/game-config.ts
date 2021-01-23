class GameConfig {
    playAsWhite: boolean;
    armory: {string: number};

    constructor(playAsWhite: boolean, armory: {string: number}) {
        this.playAsWhite = playAsWhite;
        this.armory = armory;
    }
}

export {GameConfig}