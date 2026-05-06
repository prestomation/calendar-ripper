import { AXSSkinRipper } from '../../lib/config/axsskin.js';

const LOCATION = "Neumos, 925 E Pike St, Seattle, WA 98122";

export default class NeumosRipper extends AXSSkinRipper {
    protected readonly venueId = 'neumos';
    protected readonly location = LOCATION;
    protected readonly defaultDurationHours = 3;
}