// Type-only imports/exports keep the bibtex parser out of the runtime
// module graph, so the parser ships only inside the worker bundle.
import type { Entry as EntryDataBibLaTeX } from '@retorquere/bibtex-parser';
export type { Entry as EntryDataBibLaTeX } from '@retorquere/bibtex-parser';

// Trick: allow string indexing onto object properties
export interface IIndexable {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
}

export const databaseTypes = ['csl-json', 'biblatex'] as const;
export type DatabaseType = typeof databaseTypes[number];

export const TEMPLATE_VARIABLES = {
  citekey: 'Unique citekey',
  abstract: '',
  authorString: 'Comma-separated list of author names',
  authorLastNameString: 'Comma-separated list of author last names',
  firstAuthorLastName: 'Last name of the first author',
  firstAuthorLastNameEtAl:
    'Last name of the first author, followed by "et al." if there is more than one author',
  containerTitle:
    'Title of the container holding the reference (e.g. book title for a book chapter, or the journal title for a journal article)',
  dateAdded: 'Date the reference was added to the reference manager',
  DOI: '',
  eprint: '',
  eprinttype: '',
  eventPlace: 'Location of event',
  files: 'List of file paths attached to the reference (e.g. PDFs)',
  ISBN: '',
  ISSN: '',
  keywords: 'Comma-separated list of keywords/tags',
  note: '',
  page: 'Page or page range',
  publisher: '',
  publisherPlace: 'Location of publisher',
  title: '',
  titleShort: '',
  URL: '',
  year: 'Publication year',
  zoteroSelectURI: 'URI to open the reference in Zotero',
};

export class Library {
  constructor(public entries: { [citekey: string]: Entry }) {}

  get size(): number {
    return Object.keys(this.entries).length;
  }

  /**
   * For the given citekey, find the corresponding `Entry` and return a
   * collection of template variable assignments.
   */
  getTemplateVariablesForCitekey(citekey: string): Record<string, unknown> {
    const entry: Entry = this.entries[citekey];
    const shortcuts = {
      citekey: citekey,

      abstract: entry.abstract,
      authorString: entry.authorString,
      authorLastNameString: entry.authorLastNameString,
      firstAuthorLastName: entry.firstAuthorLastName,
      firstAuthorLastNameEtAl: entry.firstAuthorLastNameEtAl,
      containerTitle: entry.containerTitle,
      dateAdded: entry.dateAdded,
      DOI: entry.DOI,
      eprint: entry.eprint,
      eprinttype: entry.eprinttype,
      eventPlace: entry.eventPlace,
      files: entry.files,
      ISBN: entry.ISBN,
      ISSN: entry.ISSN,
      keywords: entry.keywords,
      note: entry.note,
      page: entry.page,
      publisher: entry.publisher,
      publisherPlace: entry.publisherPlace,
      title: entry.title,
      titleShort: entry.titleShort,
      URL: entry.URL,
      year: entry.year?.toString(),
      zoteroSelectURI: entry.zoteroSelectURI,
    };

    return { entry: entry.toJSON(), ...shortcuts };
  }
}

// `loadEntries` lives in `./load-entries`, imported only by the worker.

export interface Author {
  given?: string;
  family?: string;
  literal?: string;
}

/**
 * An `Entry` represents a single reference in a reference database.
 * Each entry has a unique identifier, known in most reference managers as its
 * "citekey."
 */
export abstract class Entry {
  /**
   * Unique identifier for the entry (also the citekey).
   */
  public abstract id: string;

  public abstract type: string;

  public abstract abstract?: string;
  public abstract author?: Author[];

  /**
   * A comma-separated list of authors, each of the format `<firstname> <lastname>`.
   */
  public abstract authorString?: string;

  /**
   * A comma-separated list of author last names.
   */
  public get authorLastNameString(): string {
    return (this.author ?? [])
      .map((a) => a.family || a.literal || a.given || '')
      .filter((name) => name.length > 0)
      .join(', ');
  }

  /**
   * The last name of the first author (or the literal name for
   * institutional authors without a family name).
   */
  public get firstAuthorLastName(): string {
    const first = this.author?.[0];
    return first ? first.family || first.literal || first.given || '' : '';
  }

  /**
   * The last name of the first author followed by "et al." when the
   * reference has more than one author -- e.g. `Smith et al.`.
   */
  public get firstAuthorLastNameEtAl(): string {
    const lastName = this.firstAuthorLastName;
    return this.author && this.author.length > 1
      ? `${lastName} et al.`
      : lastName;
  }

  /**
   * The name of the container for this reference -- in the case of a book
   * chapter reference, the name of the book; in the case of a journal article,
   * the name of the journal.
   */
  public abstract containerTitle?: string;

  /**
   * The date the reference was added to the reference manager, if known.
   */
  public abstract dateAdded?: string;

  public abstract DOI?: string;
  public abstract files?: string[];

  public abstract ISBN?: string;
  public abstract ISSN?: string;

  /**
   * A comma-separated list of keywords/tags attached to the reference.
   */
  public abstract keywords?: string;

  /**
   * The date of issue. Many references do not contain information about month
   * and day of issue; in this case, the `issuedDate` will contain dummy minimum
   * values for those elements. (A reference which is only encoded as being
   * issued in 2001 is represented here with a date 2001-01-01 00:00:00 UTC.)
   */
  public abstract issuedDate?: Date;

  /**
   * Page or page range of the reference.
   */
  public abstract page?: string;
  public abstract title?: string;
  public abstract titleShort?: string;
  public abstract URL?: string;

  public abstract eventPlace?: string;

  public abstract publisher?: string;
  public abstract publisherPlace?: string;

  /**
   * BibLaTeX-specific properties
   */
  public abstract eprint?: string;
  public abstract eprinttype?: string;

  protected _year?: string;
  public get year(): number {
    return this._year
      ? parseInt(this._year)
      : this.issuedDate?.getUTCFullYear();
  }

  protected _note?: string[];

  public get note(): string {
    return this._note
      ?.map((el) => el.replace(/(zotero:\/\/.+)/g, '[Link]($1)'))
      .join('\n\n');
  }

  /**
   * A URI which will open the relevant entry in the Zotero client.
   */
  public get zoteroSelectURI(): string {
    return `zotero://select/items/@${this.id}`;
  }

  toJSON(): Record<string, unknown> {
    const jsonObj: Record<string, unknown> = Object.assign(
      {},
      this,
    ) as Record<string, unknown>;

    // add getter values
    const proto = Object.getPrototypeOf(this);
    Object.entries(Object.getOwnPropertyDescriptors(proto))
      .filter(([, descriptor]) => typeof descriptor.get == 'function')
      .forEach(([key, descriptor]) => {
        if (descriptor && key[0] !== '_') {
          try {
            const val = (this as IIndexable)[key];
            jsonObj[key] = val;
          } catch {
            return;
          }
        }
      });

    return jsonObj;
  }
}

export type EntryData = EntryDataCSL | EntryDataBibLaTeX;

export interface EntryDataCSL {
  id: string;
  type: string;

  abstract?: string;
  author?: Author[];
  'container-title'?: string;
  DOI?: string;
  'event-place'?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  issued?: { 'date-parts': [any[]] };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  accessed?: { 'date-parts': [any[]] };
  ISBN?: string;
  ISSN?: string;
  keyword?: string;
  page?: string;
  publisher?: string;
  'publisher-place'?: string;
  title?: string;
  'title-short'?: string;
  URL?: string;
}

export class EntryCSLAdapter extends Entry {
  constructor(private data: EntryDataCSL) {
    super();
  }

  eprint: string = null;
  eprinttype: string = null;
  files: string[] = null;

  get id() {
    return this.data.id;
  }
  get type() {
    return this.data.type;
  }

  get abstract() {
    return this.data.abstract;
  }
  get author() {
    return this.data.author;
  }

  get dateAdded() {
    const dateParts = this.data.accessed?.['date-parts']?.[0];
    if (!dateParts || dateParts.length === 0) return null;
    const [year, month, day] = dateParts;
    let result = String(year);
    if (month != null) result += `-${String(month).padStart(2, '0')}`;
    if (day != null) result += `-${String(day).padStart(2, '0')}`;
    return result;
  }

  get ISBN() {
    return this.data.ISBN;
  }

  get ISSN() {
    return this.data.ISSN;
  }

  get keywords() {
    return this.data.keyword;
  }

  get authorString(): string | null {
    return this.data.author
      ? this.data.author.map((a) => `${a.given} ${a.family}`).join(', ')
      : null;
  }

  get containerTitle() {
    return this.data['container-title'];
  }

  get DOI() {
    return this.data.DOI;
  }

  get eventPlace() {
    return this.data['event-place'];
  }

  get issuedDate() {
    if (
      !(
        this.data.issued &&
        this.data.issued['date-parts'] &&
        this.data.issued['date-parts'][0].length > 0
      )
    )
      return null;

    const [year, month, day] = this.data.issued['date-parts'][0];
    return new Date(Date.UTC(year, (month || 1) - 1, day || 1));
  }

  get page() {
    return this.data.page;
  }

  get publisher() {
    return this.data.publisher;
  }

  get publisherPlace() {
    return this.data['publisher-place'];
  }

  get title() {
    return this.data.title;
  }

  get titleShort() {
    return this.data['title-short'];
  }

  get URL() {
    return this.data.URL;
  }
}

const BIBLATEX_PROPERTY_MAPPING: Record<string, string> = {
  abstract: 'abstract',
  booktitle: '_containerTitle',
  date: 'issued',
  doi: 'DOI',
  eprint: 'eprint',
  eprinttype: 'eprinttype',
  eventtitle: 'event',
  journal: '_containerTitle',
  journaltitle: '_containerTitle',
  location: 'publisherPlace',
  pages: 'page',
  shortjournal: 'containerTitleShort',
  title: 'title',
  shorttitle: 'titleShort',
  url: 'URL',
  venue: 'eventPlace',
  year: '_year',
  publisher: 'publisher',
  note: '_note',
};

// BibLaTeX parser returns arrays of property values (allowing for repeated
// property entries). For the following fields, just blindly take the first.
const BIBLATEX_PROPERTY_TAKE_FIRST: string[] = [
  'abstract',
  'booktitle',
  '_containerTitle',
  'date',
  'doi',
  'eprint',
  'eprinttype',
  'eventtitle',
  'journaltitle',
  'location',
  'pages',
  'shortjournal',
  'title',
  'shorttitle',
  'url',
  'venue',
  '_year',
  'publisher',
];

export class EntryBibLaTeXAdapter extends Entry {
  abstract?: string;
  _containerTitle?: string;
  containerTitleShort?: string;
  DOI?: string;
  eprint?: string;
  eprinttype?: string;
  event?: string;
  eventPlace?: string;
  issued?: string;
  page?: string;
  publisher?: string;
  publisherPlace?: string;
  title?: string;
  titleShort?: string;
  URL?: string;
  _year?: string;
  _note?: string[];

  constructor(private data: EntryDataBibLaTeX) {
    super();

    Object.entries(BIBLATEX_PROPERTY_MAPPING).forEach(
      (map: [string, string]) => {
        const [src, tgt] = map;
        if (src in this.data.fields) {
          let val: string | string[] = this.data.fields[src];
          if (
            BIBLATEX_PROPERTY_TAKE_FIRST.includes(src) &&
            Array.isArray(val)
          ) {
            val = val[0];
          }

          (this as IIndexable)[tgt] = val;
        }
      },
    );
  }

  get id() {
    return this.data.key;
  }
  get type() {
    return this.data.type;
  }

  get files(): string[] {
    // For some reason the bibtex parser doesn't reliably parse file list to
    // array ; so we'll do it manually / redundantly
    let ret: string[] = [];
    if (this.data.fields.file) {
      ret = ret.concat(this.data.fields.file.flatMap((x: string) => x.split(';')));
    }
    if (this.data.fields.files) {
      ret = ret.concat(this.data.fields.files.flatMap((x: string) => x.split(';')));
    }

    return ret;
  }

  get keywords(): string {
    const keywords = this.data.fields.keywords;
    if (!keywords) return null;
    // The parser splits comma-separated keyword lists into arrays; rejoin
    // with a plain comma to match the CSL `keyword` convention.
    return Array.isArray(keywords) ? keywords.join(',') : keywords;
  }

  get ISBN(): string {
    const isbn = this.data.fields.isbn;
    if (!isbn) return null;
    return Array.isArray(isbn) ? isbn[0] : isbn;
  }

  get ISSN(): string {
    const issn = this.data.fields.issn;
    if (!issn) return null;
    return Array.isArray(issn) ? issn[0] : issn;
  }

  get dateAdded(): string {
    const dateAdded = this.data.fields.dateadded;
    if (!dateAdded) return null;
    return Array.isArray(dateAdded) ? dateAdded[0] : dateAdded;
  }

  get authorString() {
    if (this.data.creators.author) {
      const names = this.data.creators.author.map((name) => {
        if (name.literal) return name.literal;
        const parts = [name.firstName, name.prefix, name.lastName, name.suffix];
        // Drop any null parts and join
        return parts.filter((x) => x).join(' ');
      });
      return names.join(', ');
    } else {
      return this.data.fields.author?.join(', ');
    }
  }

  get containerTitle() {
    if (this._containerTitle) {
      return this._containerTitle;
    } else if (this.data.fields.eprint) {
      const prefix = this.data.fields.eprinttype
        ? `${this.data.fields.eprinttype}:`
        : '';
      const suffix = this.data.fields.primaryclass
        ? ` [${this.data.fields.primaryclass}]`
        : '';
      return `${prefix}${this.data.fields.eprint}${suffix}`;
    }
  }

  get issuedDate() {
    return this.issued ? new Date(this.issued) : null;
  }

  get author(): Author[] {
    return this.data.creators.author?.map((a) => ({
      given: a.firstName,
      family: a.lastName,
      literal: a.literal,
    }));
  }
}
