export enum FanSpeed {
    off = 0,
    speed1 = 1,
    speed2 = 2,
    speed3 = 3
}

// tslint:disable-next-line: no-namespace
export namespace FanSpeed {
    export function getFanSpeed(speed: number): FanSpeed {
        // TODO: dynamically handle speed types. This currently assumes three speeds
        switch (speed) {
            case 33:
                return FanSpeed.speed1;
            case 66:
                return FanSpeed.speed2;
            case 99:
                return FanSpeed.speed3;
            default:
                return FanSpeed.off;
        }
    }

    export function getHKSpeed(speed: FanSpeed): number {
        // TODO: dynamically handle speed types. This currently assumes three speeds
        switch (speed) {
            case FanSpeed.speed1:
                return 33;
            case FanSpeed.speed2:
                return 66;
            case FanSpeed.speed3:
                return 99;
            default:
                return 0;
        }
    }
}