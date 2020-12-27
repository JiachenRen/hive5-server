class GameConfig {
    playAsWhite: boolean;
    includesMosquito: boolean;
    includesLadybug: boolean;

    constructor(playAsWhite: boolean, includesMosquito: boolean, includesLadybug: boolean) {
        this.playAsWhite = playAsWhite;
        this.includesMosquito = includesMosquito;
        this.includesLadybug = includesLadybug;
    }
}

export {GameConfig}