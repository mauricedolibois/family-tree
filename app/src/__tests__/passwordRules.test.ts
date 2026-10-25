/**
 * @jest-environment node
 */
import { MIN_PASSWORD_LENGTH, passwordError, passwordProblem } from '@/lib/passwordRules'
import { MESSAGES } from '@/i18n/messages'

const me = ['Lars Reiser', 'lars.reiser@example.org']

describe('passwordProblem', () => {
  it('accepts a few words that belong together only for this person', () => {
    expect(passwordProblem('Kuchen am Sonntag', me)).toBeNull()
    expect(passwordProblem('grüne Tomaten im Keller', me)).toBeNull()
    expect(passwordProblem('Pferdekoppel7', me)).toBeNull()
    // A name inside a longer phrase is fine
    expect(passwordProblem('Lars mag grüne Tomaten', me)).toBeNull()
  })

  it('counts characters, not bytes, for the minimum, and bytes for the maximum', () => {
    expect(passwordProblem('kurz12345')).toBe('short')
    expect(passwordProblem('Grüße aus Köln'.slice(0, MIN_PASSWORD_LENGTH))).toBeNull()
    expect(passwordProblem('ä'.repeat(36) + 'b')).toBe('long')
    const phrase = 'Die Tomaten im Keller wachsen besser als die Gurken am Waldrand, sagt Oma' // 73 bytes
    expect(passwordProblem(phrase)).toBe('long')
    expect(passwordProblem(phrase.slice(0, -1))).toBeNull()
  })

  it('refuses the most used passwords', () => {
    for (const pw of ['password123', 'Basketball', '1q2w3e4r5t', 'iloveyou12'])
      expect(passwordProblem(pw)).toBe('common')
  })

  it('refuses common words with digits, symbols or look-alike digits around them', () => {
    for (const pw of ['Sommer2024!', 'P4ssw0rt2024', 'Stammbaum2024', '!!Fußball!!1', 'hallo1234567'])
      expect(passwordProblem(pw)).toBe('common')
  })

  it('refuses repetitions and runs along the keyboard or the alphabet', () => {
    for (const pw of [
      'aaaaaaaaaa',
      'sommersommer',
      'abcabcabcabc',
      'qwertzuiop',
      'poiuytrewq',
      '0987654321',
      'abcdefghijk',
    ])
      expect(passwordProblem(pw)).toBe('common')
  })

  it("refuses the person's own name or address with a bit around it", () => {
    expect(passwordProblem('Reiser1975!', me)).toBe('personal')
    expect(passwordProblem('lars.reiser@example.org', me)).toBe('personal')
    expect(passwordProblem('Lars Reiser 1975', me)).toBe('personal')
    expect(passwordProblem('Reiser1975!', [])).toBeNull()
  })
})

describe('passwordError', () => {
  it('gives the text in the language asked for', () => {
    expect(passwordError('kurz', [], MESSAGES.de)).toContain(String(MIN_PASSWORD_LENGTH))
    expect(passwordError('Sommer2024!', [], MESSAGES.en)).toBe(MESSAGES.en.auth.passwordProblem.common)
    expect(passwordError('Kuchen am Sonntag', [], MESSAGES.fr)).toBeNull()
  })
})
