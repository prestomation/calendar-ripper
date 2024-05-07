import { DateTimeFormatter, LocalDate, LocalDateTime, TemporalAccessor } from "@js-joda/core";

const regex = /{([a-zA-Z-]+)}/g
interface DateReplacements {
    key: string;
    format: DateTimeFormatter;

}

export class URLTemplate {

    constructor(private readonly urlPattern: URL, private readonly replacements: DateReplacements[]) {

    }

    public getURL(date: LocalDateTime): URL {
        const replaced = this.replacements.reduce<String>((prev, curr) => prev.replaceAll(`{${curr.key}}`, curr.format.format(date))
            , this.urlPattern.toString());
        return new URL(replaced.toString());
    }
}

export class URLParser {

    constructor(readonly url: URL) {

    }

    private getDateReplacements(): DateReplacements[] {
        const validPatterns = ["yyyy-MM-dd"];
        const matches = this.url.toString().matchAll(regex);
        let replacements: DateReplacements[] = [];
        for (let match of matches) {
            let pattern = match[1];
            if (!validPatterns.includes(pattern)) {
                throw Error(`Invalid pattern: ${pattern}`);
            }
            replacements.push({ key: pattern, format: DateTimeFormatter.ofPattern(pattern) });
        }
        return replacements;

    }

    public isValid(): boolean {
        try {
            this.getDateReplacements();
        }
        catch (e) {
            return false;
        }
        // TODO: Check all the patterns
        return true;

    }

    public getTemplate(): URLTemplate {

        return new URLTemplate(this.url, this.getDateReplacements());
    }
}