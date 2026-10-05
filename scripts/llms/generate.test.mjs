// Run with: node --test
import { test } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { ROOT, SITE, generate, listPages, parseFrontmatter } from "./generate.mjs"

const llms = readFileSync(join(ROOT, "llms.txt"), "utf8")
const docs = JSON.parse(readFileSync(join(ROOT, "docs.json"), "utf8"))

test("committed llms.txt matches the generator output", () => {
    assert.equal(llms, generate(), "Run: node scripts/llms/generate.mjs")
})

test("follows the llms.txt format: H1, then blockquote summary", () => {
    const lines = llms.split("\n")
    assert.match(lines[0], /^# \S/)
    assert.equal(lines[1], "")
    assert.match(lines[2], /^> \S/)
    assert.equal(llms.match(/^# /gm).length, 1, "exactly one H1")
})

test("includes when-to-use guidance and how to call Diga", () => {
    assert.match(llms, /^## When to use Diga$/m)
    assert.match(llms, /^## How an agent should call Diga$/m)
    assert.ok(llms.includes("https://mcp.diga.io/mcp"))
    assert.ok(llms.includes("https://api.diga.io/openapi.json"))
})

test("links every page in docs.json navigation", () => {
    const missing = listPages(docs).filter((slug) => !llms.includes(`(${SITE}/${slug}.md)`))
    assert.deepEqual(missing, [])
})

test("every list link is absolute", () => {
    const links = [...llms.matchAll(/\]\(([^)]+)\)/g)].map((m) => m[1])
    assert.ok(links.length > 50)
    for (const link of links) assert.match(link, /^https:\/\//, link)
})

test("parseFrontmatter handles quoted and unquoted values", () => {
    const fm = parseFrontmatter('---\ntitle: "A \\"quoted\\" title"\ndescription: plain text\nrss: true\n---\nbody')
    assert.deepEqual(fm, { title: 'A "quoted" title', description: "plain text", rss: "true" })
    assert.deepEqual(parseFrontmatter("no frontmatter"), {})
})

test("a group's own pages are listed before its subgroups", () => {
    const page = llms.indexOf("(https://docs.diga.io/es/build/agentes/personalizacion-llamada.md)")
    const subgroup = llms.indexOf("###### Caminos Conversacionales")
    assert.ok(page > 0 && subgroup > 0)
    assert.ok(page < subgroup)
})
