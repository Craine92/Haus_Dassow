import { describe, expect, it } from 'vitest'
import { parseIncomingShare } from './share'

describe('geteilte Produktlinks', () => {
  it('übernimmt URL und Titel von Android Share Target', () => {
    const value = parseIncomingShare('?title=Mein+Schrank&url=https%3A%2F%2Fwww.otto.de%2Fp%2Fabc')
    expect(value).toMatchObject({ name: 'Mein Schrank', retailer: 'OTTO', url: 'https://www.otto.de/p/abc' })
  })
  it('liest Produktlinks aus geteiltem Text', () => {
    const value = parseIncomingShare('?text=Schau+mal%3A+https%3A%2F%2Fwww.amazon.de%2Fdp%2FABCD+super')
    expect(value?.retailer).toBe('Amazon')
    expect(value?.url).toBe('https://www.amazon.de/dp/ABCD')
  })
  it('weist gefährliche und nicht vorhandene URLs zurück', () => {
    expect(parseIncomingShare('?url=javascript%3Aalert(1)')).toBeNull()
    expect(parseIncomingShare('?title=Kein+Link')).toBeNull()
  })
})
