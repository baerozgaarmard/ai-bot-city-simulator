import { describe, it, expect } from 'vitest'

// NOTE: App.tsx cannot be rendered in node (no DOM test env installed),
// so this checks the actual submitAdd source in that file, as
// frame-delta.test.ts does for PhaserScene's update(). The e2e suite
// covers the form at runtime.
describe('add agent form validation', () => {
  it('submitAdd requires a role and trims it before creating the agent', async () => {
    // Regression: the form validated the name (required, unique) but
    // not the occupation, so clearing it created an agent with a blank
    // role — shown empty in the registry and inspector — that silently
    // worked at the office, because addAgent looks the role up
    // verbatim in WORKPLACE_BY_ROLE and falls back to 'office' for an
    // unknown role. A padded 'Chef ' missed the lookup the same way
    // instead of working at the restaurant.
    const fs = await import('node:fs'); const path = await import('node:path')
    const src = fs.readFileSync(path.join(process.cwd(), 'src', 'App.tsx'), 'utf8')
    const submit = src.slice(src.indexOf('const submitAdd'), src.indexOf('const doSave'))
    expect(submit).toMatch(/if \(!form\.role\.trim\(\)\) \{ setFormError\('Role is required\.'\); return \}/)
    expect(submit).toMatch(/role: form\.role\.trim\(\)/)
    // The role check runs before addAgent is called, like the name checks.
    expect(submit.indexOf("Role is required")).toBeLessThan(submit.indexOf('engine.addAgent'))
  })
})
