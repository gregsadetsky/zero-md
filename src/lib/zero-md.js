import ZeroMdBase from './zero-md-base.js'
import { DEFAULT_STYLESHEETS, DEFAULT_LIBRARIES } from './const.js'

let uid = 0

/**
 * Extends ZeroMdBase with marked.js, syntax highlighting, math and mermaid features
 */
export default class ZeroMd extends ZeroMdBase {
  async load({ stylesheets = DEFAULT_STYLESHEETS, libraries = DEFAULT_LIBRARIES } = {}) {
    this.template +=
      stylesheets
        .map(
          ([href, ...attrs]) => `<link ${['rel="stylesheet"', ...attrs].join(' ')} href="${href}">`
        )
        .join('') + '<style>.markdown-alert{padding:0.25rem 0 0 1rem!important;}</style>'
    if (!this.marked) {
      const { marked, markedBaseUrl, markedHighlight, markedExtensions } = libraries
      const mods = await Promise.all(
        [marked, markedBaseUrl, markedHighlight]
          .concat(markedExtensions.map((i) => i[0]))
          .map((i) => import(/* @vite-ignore */ i))
      )
      this.marked = new mods[0].Marked({ async: true })
      this.setBaseUrl = mods[1].baseUrl
      this.markedHighlight = mods[2].markedHighlight
      for (const [mod, key] of mods
        .slice(3)
        .map((i, idx) => [i, markedExtensions[idx][1] || 'default'])) {
        this.marked.use(mod[key]())
      }
    }
    const loadKatex = async () => {
      this.katex = (await import(/* @vite-ignore */ libraries.katex)).default
    }
    /* eslint-disable */
    const inlineRule =
      /^(\${1,2})(?!\$)((?:\\.|[^\\\n])*?(?:\\.|[^\\\n\$]))\1(?=[\s?!\.,:？！。，：]|$)/
    const blockRule = /^(\${1,2})\n((?:\\[^]|[^\\])+?)\n\1(?:\n|$)/
    /* eslint-enable */
    this.marked.use(
      {
        ...this.markedHighlight({
          async: true,
          highlight: async (code = '', lang = '') => {
            if (lang === 'mermaid') {
              if (!this.mermaid) {
                this.mermaid = (await import(/* @vite-ignore */ libraries.mermaid)).default
                this.mermaid.initialize({ startOnLoad: false })
              }
              const { svg } = await this.mermaid.render(`mermaid-svg-${uid++}`, code)
              return svg
            }
            if (lang === 'math') {
              if (!this.katex) await loadKatex()
              return this.parseKatex(code, { displayMode: true })
            }
            if (!this.hljs) {
              this.hljs = (await import(/* @vite-ignore */ libraries.hljs)).default
            }
            return this.hljs.getLanguage(lang)
              ? this.hljs.highlight(code, { language: lang }).value
              : this.hljs.highlightAuto(code).value
          }
        }),
        renderer: {
          code: (code = '', lang = '') => {
            if (lang === 'mermaid') return `<div class="mermaid">${code}</div>`
            if (lang === 'math') return code
            return `<pre><code class="hljs${lang ? ` language-${lang}` : ''}">${code}\n</code></pre>`
          }
        }
      },
      {
        extensions: [
          {
            name: 'inlineKatex',
            level: 'inline',
            start(/** @type {*} */ src) {
              let index
              let indexSrc = src
              while (indexSrc) {
                index = indexSrc.indexOf('$')
                if (index === -1) return
                if (index === 0 || indexSrc.charAt(index - 1) === ' ') {
                  const possibleKatex = indexSrc.substring(index)
                  if (possibleKatex.match(inlineRule)) {
                    return index
                  }
                }
                indexSrc = indexSrc.substring(index + 1).replace(/^\$+/, '')
              }
            },
            tokenizer(/** @type {*} */ src) {
              const match = src.match(inlineRule)
              if (match) {
                return {
                  type: 'inlineKatex',
                  raw: match[0],
                  text: match[2].trim(),
                  displayMode: match[1].length === 2
                }
              }
            },
            renderer(/** @type {*} */ token) {
              return token.text
            }
          },
          {
            name: 'blockKatex',
            level: 'block',
            tokenizer(/** @type {*} */ src) {
              const match = src.match(blockRule)
              if (match) {
                return {
                  type: 'blockKatex',
                  raw: match[0],
                  text: match[2].trim(),
                  displayMode: match[1].length === 2
                }
              }
            },
            renderer(/** @type {*} */ token) {
              return token.text
            }
          }
        ],
        walkTokens: async (/** @type {*} */ token) => {
          if (['inlineKatex', 'blockKatex'].includes(token.type)) {
            if (!this.katex) await loadKatex()
            token.text = this.parseKatex(token.text, { displayMode: token.type === 'blockKatex' })
          }
        }
      }
    )
  }

  parseKatex(text = '', opts = {}) {
    return this.katex.renderToString(text, { ...opts, throwOnError: false })
  }

  async parse({ text = '', baseUrl = '' }) {
    this.marked.use(this.setBaseUrl(baseUrl || ''))
    return this.marked.parse(text)
  }
}
