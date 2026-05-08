import { AXSSkinRipper } from '../../lib/config/axsskin.js';

const LOCATION = "Barboza, 925 E Pike St, Seattle, WA 98122";

export default class BarbozaRipper extends AXSSkinRipper {
    protected readonly venueId = 'barboza';
    protected readonly location = LOCATION;
    protected readonly defaultDurationHours = 3;
}