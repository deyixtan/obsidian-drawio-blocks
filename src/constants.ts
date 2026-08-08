export const DRAWIO_ORIGIN = 'https://embed.diagrams.net';
export const DRAWIO_EDITOR_URL = `${DRAWIO_ORIGIN}/`;
export const DEFAULT_EDITOR_SETTINGS_VERSION = '1';
export const DEFAULT_PREVIEW_BORDER_COLOR = '#808080';

export const DRAWIO_RESTRICTED_URL_PARAMS: Readonly<Record<string, string>> = {
	plugins: '0',
	picker: '0',
	browser: '0',
	noDevice: '1',
	pwa: '0',
	gapi: '0',
	db: '0',
	od: '0',
	ms365: '0',
	tr: '0',
	gh: '0',
	gl: '0',
	sync: 'none',
	stealth: '1',
	lockdown: '1',
	suppressNewWindows: '1',
};

export const EMPTY_DRAWIO_XML = `<mxfile>
  <diagram id="page-1" name="Page-1">
    <mxGraphModel>
      <root>
        <mxCell id="0" />
        <mxCell id="1" parent="0" />
      </root>
    </mxGraphModel>
  </diagram>
</mxfile>`;
