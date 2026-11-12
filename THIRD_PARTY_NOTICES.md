# Third-party notices

VIS is MIT-licensed (see [`LICENSE`](LICENSE)). It ships the following third-party files unmodified in `vendor/`. Each one was downloaded at an exact version and its hash was checked before it was committed; `npm run verify-vendor` re-checks the hashes below. The full license texts are in [`licenses/`](licenses/).

| File | Project | Version | License | Copyright holder | SHA-256 (base64) |
|---|---|---|---|---|---|
| `vendor/vega-6.4.0.min.js` | [Vega](https://github.com/vega/vega) | 6.4.0 | BSD-3-Clause | University of Washington Interactive Data Lab | `sha256-j2o1h8+NT0LH4IEg4+sF0GfnRtVU450tz1KswL1boo8=` |
| `vendor/vega-lite-6.5.0.min.js` | [Vega-Lite](https://github.com/vega/vega-lite) | 6.5.0 | BSD-3-Clause | University of Washington Interactive Data Lab | `sha256-g+IV6E4wjuhoj6ZQO6Dxz4o8BcDWHfKEGguSv4aAngA=` |
| `vendor/vega-interpreter-2.3.2.js` | [vega-interpreter](https://github.com/vega/vega/tree/main/packages/vega-interpreter) | 2.3.2 | BSD-3-Clause | University of Washington Interactive Data Lab | `sha256-wL23NaY/knbxNujZDX/fXY6d+AMesGkEj8mXXIdv1/k=` |
| `vendor/inter-latin-wght-normal-5.3.0.woff2` | [Inter](https://github.com/rsms/inter) (Latin subset, weight axis) | 5.3.0 | SIL Open Font License 1.1 | The Inter Project Authors | `sha256-MQDndehhbNJhG+7PojpCY9cDdYZ4m0PwNSNqLm+9TGI=` |

## Optional engines (not bundled)

[Mermaid](https://github.com/mermaid-js/mermaid) (MIT) renders `mermaid` blocks when you install it next to VIS (`npm i mermaid`) or point `VIS_MERMAID` at a `mermaid.min.js` file. It is not shipped with VIS because its browser build embeds several third-party components under other licenses (including ELK under EPL-2.0); if you redistribute it, follow Mermaid's own notices.

## Derived files

| File | Derived from | Change |
|---|---|---|
| `clients/web/dist/vega-interpreter-2.3.2.browser.js` (generated, not committed) | `vendor/vega-interpreter-2.3.2.js` (BSD-3-Clause) | Only the first line changes: the `import ... from 'vega-util'` statement reads the same three functions from `globalThis.vega`, because browsers can't resolve bare package names. `clients/web/build.mjs` generates it and fails if that line ever changes upstream. The copyright notice is kept in the file header. |

The web client build also writes `clients/web/dist/LICENSES.txt`, which bundles the Vega, Vega-Lite, vega-interpreter and VIS notices so they travel with the files when you copy them into another app.

## Color palettes

- **Okabe-Ito**: the color-universal-design palette by Masataka Okabe and Kei Ito, *Color Universal Design (CUD): How to make figures and presentations that are friendly to colorblind people* (2002, revised 2008). Some tones were darkened or lightened so each one passes 3:1 contrast in its theme.
- **ColorBrewer Dark2**: this product includes color specifications and designs developed by Cynthia Brewer (http://colorbrewer.org/). VIS uses four tones (series 3 to 6) by Cynthia A. Brewer, Mark Harrower and The Pennsylvania State University. Notice required by its license (Apache 2.0, ColorBrewer 2.0):

  > Apache-Style Software License for ColorBrewer software and ColorBrewer Color Schemes. Copyright (c) 2002 Cynthia Brewer, Mark Harrower, and The Pennsylvania State University. Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License. You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0. Unless required by applicable law or agreed to in writing, software distributed under the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the License for the specific language governing permissions and limitations under the License.

## Updating a vendored engine

1. Download the project's official npm tarball at an exact version (never a range or `latest`), for example with `npm pack vega@6.4.0`.
2. Check the tarball against the `integrity` (SHA-512) the npm registry publishes for that version, then take the file from it.
3. Replace the file, rename it with the new version, update every path that references it, and update the table above.
4. Run `npm run verify-vendor` and `npm test`.
