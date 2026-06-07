import { describe, it, expect } from 'vitest';
import {
  getActivityKeyword,
  formatSwitchCondition,
  reprValue,
  sanitizeIdentifier,
  sanitizeString,
} from './utils';

describe('getActivityKeyword', () => {
  it('converts snake_case activityId to PascalCase', () => {
    expect(getActivityKeyword({ activityId: 'click_button' })).toBe('Click Button');
    expect(getActivityKeyword({ activityId: 'open_application' })).toBe('Open Application');
    expect(getActivityKeyword({ activityId: 'get_text' })).toBe('Get Text');
  });

  it('handles activityId with multiple underscores', () => {
    expect(getActivityKeyword({ activityId: 'get_text_from_element' })).toBe('Get Text From Element');
  });

  it('falls back to name when activityId is missing', () => {
    expect(getActivityKeyword({ name: 'My Activity' })).toBe('My Activity');
  });

  it('falls back to name when activityId is undefined', () => {
    expect(getActivityKeyword({ activityId: undefined, name: 'Fallback Name' })).toBe('Fallback Name');
  });

  it('defaults to Log when neither activityId nor name exists', () => {
    expect(getActivityKeyword({})).toBe('Log');
  });

  it('defaults to Log when both are undefined', () => {
    expect(getActivityKeyword({ activityId: undefined, name: undefined })).toBe('Log');
  });

  it('defaults to Log when both are empty string', () => {
    expect(getActivityKeyword({ activityId: '', name: '' })).toBe('Log');
  });

  it('handles activityId that is already PascalCase', () => {
    // \b word boundary + \w matches first char of each word, making it uppercase
    expect(getActivityKeyword({ activityId: 'AlreadyPascal' })).toBe('AlreadyPascal');
  });

  it('handles activityId with numbers', () => {
    expect(getActivityKeyword({ activityId: 'get_text_2' })).toBe('Get Text 2');
  });
});

describe('formatSwitchCondition', () => {
  it('returns expression alone for empty value', () => {
    expect(formatSwitchCondition('status', '')).toBe('status');
    expect(formatSwitchCondition('status', '   ')).toBe('status');
  });

  describe('variable syntax', () => {
    it('handles ${...} variable syntax', () => {
      expect(formatSwitchCondition('status', '${var}')).toBe('status == ${var}');
      expect(formatSwitchCondition('result', '${result.value}')).toBe('result == ${result.value}');
    });

    it('handles @{...} list syntax', () => {
      expect(formatSwitchCondition('list', '@{items}')).toBe('list == @{items}');
    });

    it('handles &{...} dict syntax', () => {
      expect(formatSwitchCondition('dict', '&{config}')).toBe('dict == &{config}');
    });

    it('handles %{...} env syntax', () => {
      expect(formatSwitchCondition('env', '%{PATH}')).toBe('env == %{PATH}');
    });

    it('preserves variable syntax with whitespace', () => {
      expect(formatSwitchCondition('x', '  ${var}  ')).toBe('x == ${var}');
    });
  });

  describe('numeric values', () => {
    it('handles integer numbers', () => {
      expect(formatSwitchCondition('count', '42')).toBe('count == 42');
      expect(formatSwitchCondition('index', '0')).toBe('index == 0');
    });

    it('handles decimal numbers', () => {
      expect(formatSwitchCondition('price', '3.14')).toBe('price == 3.14');
    });

    it('handles number with leading zeros', () => {
      expect(formatSwitchCondition('num', '007')).toBe('num == 007');
    });
  });

  describe('string values', () => {
    it('wraps string values in single quotes', () => {
      expect(formatSwitchCondition('status', 'success')).toBe("status == 'success'");
    });

    it('escapes single quotes in strings', () => {
      expect(formatSwitchCondition('text', "it's")).toBe("text == 'it\\'s'");
      expect(formatSwitchCondition('msg', "don't")).toBe("msg == 'don\\'t'");
    });

    it('escapes backslashes in strings', () => {
      expect(formatSwitchCondition('path', 'C:\\Users')).toBe("path == 'C:\\\\Users'");
    });

    it('handles whitespace values', () => {
      expect(formatSwitchCondition('val', '  trimmed  ')).toBe("val == 'trimmed'");
    });
  });
});

describe('reprValue', () => {
  describe('null and undefined', () => {
    it('returns None for null', () => {
      expect(reprValue(null)).toBe('None');
    });

    it('returns None for undefined', () => {
      expect(reprValue(undefined)).toBe('None');
    });
  });

  describe('booleans', () => {
    it('returns True for boolean true', () => {
      expect(reprValue(true)).toBe('True');
    });

    it('returns False for boolean false', () => {
      expect(reprValue(false)).toBe('False');
    });
  });

  describe('numbers', () => {
    it('returns string representation for integers', () => {
      expect(reprValue(42)).toBe('42');
    });

    it('returns string representation for floats', () => {
      expect(reprValue(3.14)).toBe('3.14');
    });

    it('returns string representation for negative numbers', () => {
      expect(reprValue(-10)).toBe('-10');
    });

    it('returns string representation for zero', () => {
      expect(reprValue(0)).toBe('0');
    });
  });

  describe('string boolean-like values', () => {
    it('returns True for lowercase "true"', () => {
      expect(reprValue('true')).toBe('True');
    });

    it('returns True for capitalized "True"', () => {
      expect(reprValue('True')).toBe('True');
    });

    it('returns False for lowercase "false"', () => {
      expect(reprValue('false')).toBe('False');
    });

    it('returns False for capitalized "False"', () => {
      expect(reprValue('False')).toBe('False');
    });

    it('returns False for mixed case "FALSE"', () => {
      expect(reprValue('FALSE')).toBe('"FALSE"');
    });
  });

  describe('variable syntax', () => {
    it('keeps ${...} variables as-is', () => {
      expect(reprValue('${var}')).toBe('${var}');
      expect(reprValue('${result.value}')).toBe('${result.value}');
    });

    it('keeps @{...} list variables as-is', () => {
      expect(reprValue('@{items}')).toBe('@{items}');
    });

    it('keeps &{...} dict variables as-is', () => {
      expect(reprValue('&{config}')).toBe('&{config}');
    });

    it('preserves whitespace around variable syntax', () => {
      expect(reprValue('  ${var}  ')).toBe('${var}');
    });
  });

  describe('regular strings', () => {
    it('wraps strings in double quotes', () => {
      expect(reprValue('hello')).toBe('"hello"');
    });

    it('escapes double quotes in strings', () => {
      expect(reprValue('say "hello"')).toBe('"say \\"hello\\""');
    });

    it('escapes backslashes in strings', () => {
      expect(reprValue('path\\to\\file')).toBe('"path\\\\to\\\\file"');
    });

    it('handles empty strings', () => {
      expect(reprValue('')).toBe('""');
    });

    it('handles strings with only whitespace', () => {
      expect(reprValue('   ')).toBe('"   "');
    });
  });

  describe('non-string types', () => {
    it('converts objects to string via String()', () => {
      expect(reprValue({ key: 'value' })).toBe('"[object Object]"');
    });

    it('converts arrays to string via String()', () => {
      expect(reprValue([1, 2, 3])).toBe('"1,2,3"');
    });
  });
});

describe('sanitizeIdentifier', () => {
  it('replaces special characters with underscores', () => {
    expect(sanitizeIdentifier('my-identifier')).toBe('my_identifier');
    expect(sanitizeIdentifier('my identifier')).toBe('my_identifier');
    expect(sanitizeIdentifier('my.identifier')).toBe('my_identifier');
    expect(sanitizeIdentifier('my@identifier')).toBe('my_identifier');
  });

  it('replaces spaces with underscores', () => {
    expect(sanitizeIdentifier('hello world')).toBe('hello_world');
  });

  it('preserves alphanumeric characters and underscores', () => {
    expect(sanitizeIdentifier('var_123')).toBe('var_123');
    expect(sanitizeIdentifier('MyClass')).toBe('MyClass');
  });

  it('prefixes with underscore when first character is a digit', () => {
    expect(sanitizeIdentifier('123abc')).toBe('_123abc');
    expect(sanitizeIdentifier('0test')).toBe('_0test');
    expect(sanitizeIdentifier('9lives')).toBe('_9lives');
  });

  it('does not prefix underscore for underscore starting identifier', () => {
    expect(sanitizeIdentifier('_private')).toBe('_private');
  });

  it('returns process for empty string', () => {
    expect(sanitizeIdentifier('')).toBe('process');
  });

  it('returns underscores for string with only special characters', () => {
    expect(sanitizeIdentifier('!@#$%')).toBe('_____');
  });

  it('returns process for empty string', () => {
    expect(sanitizeIdentifier('')).toBe('process');
  });

  it('does not return process for whitespace-only string', () => {
    expect(sanitizeIdentifier('   ')).toBe('___');
  });

  it('handles identifiers that start with digit', () => {
    expect(sanitizeIdentifier('1')).toBe('_1');
    expect(sanitizeIdentifier('123')).toBe('_123');
  });

  it('replaces non-ASCII characters with underscores (ASCII-only regex)', () => {
    expect(sanitizeIdentifier('café')).toBe('caf_');
    expect(sanitizeIdentifier('идентификатор')).toBe('_____________');
    expect(sanitizeIdentifier('日本')).toBe('__');
  });
});

describe('sanitizeString', () => {
  it('removes control characters 0x00-0x08 (NUL to BS)', () => {
    expect(sanitizeString('hello\x00world')).toBe('helloworld');
    expect(sanitizeString('test\x01\x02\x03end')).toBe('testend');
    expect(sanitizeString('\x00\x01\x02')).toBe('');
  });

  it('removes control character 0x0B (vertical tab)', () => {
    expect(sanitizeString('line\x0Bbreak')).toBe('linebreak');
  });

  it('removes control character 0x0C (form feed)', () => {
    expect(sanitizeString('page\x0Cbreak')).toBe('pagebreak');
  });

  it('removes control characters 0x0E-0x1F (SO to US)', () => {
    expect(sanitizeString('text\x0Emore')).toBe('textmore');
    expect(sanitizeString('\x1Fend')).toBe('end');
    expect(sanitizeString('start\x1Emiddle\x1Fend')).toBe('startmiddleend');
  });

  it('removes control character 0x7F (DEL)', () => {
    expect(sanitizeString('hello\x7Fworld')).toBe('helloworld');
  });

  it('keeps tab character 0x09', () => {
    expect(sanitizeString('col1\tcol2')).toBe('col1\tcol2');
  });

  it('keeps newline character 0x0A', () => {
    expect(sanitizeString('line1\nline2')).toBe('line1\nline2');
  });

  it('keeps carriage return character 0x0D', () => {
    expect(sanitizeString('line1\rline2')).toBe('line1\rline2');
  });

  it('keeps printable ASCII characters', () => {
    expect(sanitizeString(' !\"#$%&\'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstuvwxyz{|}~'))
      .toBe(' !"#$%&\'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstuvwxyz{|}~');
  });

  it('handles empty string', () => {
    expect(sanitizeString('')).toBe('');
  });

  it('handles string with all control characters removed', () => {
    expect(sanitizeString('\x00\x01\x02\x07\x0B\x0C\x0E\x1F\x7F')).toBe('');
  });

  it('handles mixed content', () => {
    const mixed = 'Hello\x00World\x09Test\nLine2\rEnd';
    expect(sanitizeString(mixed)).toBe('HelloWorld\tTest\nLine2\rEnd');
  });

  it('handles Unicode characters', () => {
    expect(sanitizeString('Привет мир')).toBe('Привет мир');
    expect(sanitizeString('こんにちは世界')).toBe('こんにちは世界');
    expect(sanitizeString('🎉 emoji')).toBe('🎉 emoji');
  });
});
