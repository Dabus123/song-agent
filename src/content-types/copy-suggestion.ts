/**
 * Custom XMTP content type: copy suggestion.
 * Sends { label, text } so the chat client can render a "Copy" button inside the message.
 * When the user clicks the button, the client copies `text` to the clipboard (or into the composer).
 *
 * Clients that support this content type should render a button with `label` and on click copy `text`.
 * Clients that don't support it will see the fallback (the `text` value).
 */

export type CopySuggestionContent = {
  label: string;
  text: string;
};

const AUTHORITY_ID = 'songcast.xyz';
const TYPE_ID = 'copy-suggestion';
const VERSION_MAJOR = 1;
const VERSION_MINOR = 0;

export type ContentTypeCopySuggestionId = {
  authorityId: string;
  typeId: string;
  versionMajor: number;
  versionMinor: number;
  sameAs?: (other: unknown) => boolean;
};

export const ContentTypeCopySuggestion: ContentTypeCopySuggestionId = {
  authorityId: AUTHORITY_ID,
  typeId: TYPE_ID,
  versionMajor: VERSION_MAJOR,
  versionMinor: VERSION_MINOR,
  sameAs(other: unknown): boolean {
    if (!other || typeof other !== 'object') return false;
    const o = other as Record<string, unknown>;
    return (
      o.authorityId === AUTHORITY_ID &&
      o.typeId === TYPE_ID &&
      o.versionMajor === VERSION_MAJOR &&
      o.versionMinor === VERSION_MINOR
    );
  },
};

export type ContentCodecLike = {
  contentType: ContentTypeCopySuggestionId;
  shouldPush?: boolean;
  encode: (content: CopySuggestionContent) => Uint8Array;
  decode: (bytes: Uint8Array) => CopySuggestionContent;
  fallback?: (content: CopySuggestionContent) => string;
};

export class CopySuggestionCodec implements ContentCodecLike {
  /** Whether push notifications should be sent for this content type (default true). */
  readonly shouldPush = true;

  get contentType(): ContentTypeCopySuggestionId {
    return ContentTypeCopySuggestion;
  }

  encode(content: CopySuggestionContent): Uint8Array {
    return new TextEncoder().encode(JSON.stringify(content));
  }

  decode(bytes: Uint8Array): CopySuggestionContent {
    return JSON.parse(new TextDecoder().decode(bytes)) as CopySuggestionContent;
  }

  fallback(content: CopySuggestionContent): string {
    return content?.text ?? '';
  }
}
