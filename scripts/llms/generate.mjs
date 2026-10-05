// Builds the custom /llms.txt served by Mintlify (a root llms.txt overrides the
// auto-generated one). Output = hand-written header (when-to-use guidance for
// agents) + a page index derived from docs.json and each page's frontmatter.
//
//   node scripts/llms/generate.mjs          # write llms.txt
//   node scripts/llms/generate.mjs --check  # exit 1 if llms.txt is stale

import { readFileSync, writeFileSync, existsSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..")
export const SITE = "https://docs.diga.io"
const OUTPUT = join(ROOT, "llms.txt")

const LANGUAGE_LABELS = { es: "Español", en: "English" }

export function parseFrontmatter(source) {
    const match = source.match(/^---\r?\n([\s\S]*?)\r?\n---/)
    if (!match) return {}
    const data = {}
    for (const line of match[1].split(/\r?\n/)) {
        const kv = line.match(/^([A-Za-z_][\w-]*):\s*(.*)$/)
        if (!kv) continue
        let value = kv[2].trim()
        if (
            (value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'"))
        ) {
            value = value.slice(1, -1)
        }
        data[kv[1]] = value.replace(/\\"/g, '"')
    }
    return data
}

function readPage(slug) {
    for (const ext of [".mdx", ".md"]) {
        const file = join(ROOT, slug + ext)
        if (existsSync(file)) return parseFrontmatter(readFileSync(file, "utf8"))
    }
    throw new Error(`docs.json references a missing page: ${slug}`)
}

function renderEntries(entries, depth, lines) {
    // Pages first, then subgroups: Markdown headings have no closing tag, so a
    // page listed after a subgroup would otherwise read as part of it.
    const ordered = [
        ...entries.filter((e) => typeof e === "string"),
        ...entries.filter((e) => typeof e !== "string"),
    ]
    for (const entry of ordered) {
        if (typeof entry === "string") {
            const { title, description } = readPage(entry)
            if (!title) throw new Error(`Page without title: ${entry}`)
            const desc = description ? `: ${description}` : ""
            lines.push(`- [${title}](${SITE}/${entry}.md)${desc}`)
        } else if (entry && entry.group) {
            lines.push("", `${"#".repeat(Math.min(depth, 6))} ${entry.group}`, "")
            renderEntries(entry.pages ?? [], depth + 1, lines)
        }
    }
}

export function listPages(docs) {
    const pages = []
    const walk = (entry) => {
        if (typeof entry === "string") pages.push(entry)
        else if (entry && entry.pages) entry.pages.forEach(walk)
        else if (entry && entry.groups) entry.groups.forEach(walk)
    }
    for (const language of docs.navigation.languages) {
        language.tabs.forEach(walk)
    }
    return pages
}

export function generate() {
    const docs = JSON.parse(readFileSync(join(ROOT, "docs.json"), "utf8"))
    const header = readFileSync(join(ROOT, "scripts/llms/header.txt"), "utf8").trimEnd()
    const lines = [header]

    for (const language of docs.navigation.languages) {
        const label = LANGUAGE_LABELS[language.language] ?? language.language
        lines.push("", `## Docs (${label})`)
        for (const tab of language.tabs) {
            if (tab.openapi) continue // API reference is covered by the spec links
            lines.push("", `### ${tab.tab}`)
            if (tab.pages) {
                lines.push("")
                renderEntries(tab.pages, 4, lines)
            }
            renderEntries(tab.groups ?? [], 4, lines)
        }
    }

    const specs = new Set()
    for (const language of docs.navigation.languages) {
        for (const tab of language.tabs) if (tab.openapi) specs.add(tab.openapi)
    }
    lines.push("", "## API reference", "")
    lines.push("- [Diga API OpenAPI spec (live)](https://api.diga.io/openapi.json): Machine-readable description of every REST endpoint")
    for (const spec of specs) {
        lines.push(`- [Diga API OpenAPI spec (docs mirror)](${SITE}${spec.startsWith("/") ? spec : `/${spec}`})`)
    }

    lines.push("", "## Optional", "")
    for (const link of docs.navbar?.links ?? []) {
        lines.push(`- [${link.label}](${link.href})`)
    }
    if (docs.navbar?.primary?.href) {
        lines.push(`- [${docs.navbar.primary.label}](${docs.navbar.primary.href})`)
    }

    // Collapse accidental blank-line runs so the output is stable Markdown.
    return lines.join("\n").replace(/\n{3,}/g, "\n\n") + "\n"
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    const output = generate()
    if (process.argv.includes("--check")) {
        const current = existsSync(OUTPUT) ? readFileSync(OUTPUT, "utf8") : ""
        if (current !== output) {
            console.error("llms.txt is out of date. Run: node scripts/llms/generate.mjs")
            process.exit(1)
        }
        console.log("llms.txt is up to date")
    } else {
        writeFileSync(OUTPUT, output)
        console.log(`Wrote ${OUTPUT}`)
    }
}
