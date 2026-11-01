/* Stub : dans Three.js, RoundedBoxGeometry hérite de BoxGeometry et expose
   les mêmes `parameters` (width, height, depth). On reproduit ce contrat. */
import { BoxGeometry } from 'three';
export class RoundedBoxGeometry extends BoxGeometry {
    constructor(width = 1, height = 1, depth = 1, segments = 2, radius = 0.1) {
        super(width, height, depth);
        this.type = 'RoundedBoxGeometry';
        this.parameters = { width, height, depth, segments, radius };
    }
}
