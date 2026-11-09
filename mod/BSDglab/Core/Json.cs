// 極簡 JSON(只處理一層、值為字串/數字/布林的物件),避免依賴 Newtonsoft 版本問題
using System;
using System.Collections.Generic;
using System.Globalization;
using System.Text;

namespace BSDglab.Core
{
    public static class Json
    {
        /// <summary>Build("t","level","strength",12) → {"t":"level","strength":12}</summary>
        public static string Build(params object[] kv)
        {
            var sb = new StringBuilder("{");
            for (int i = 0; i + 1 < kv.Length; i += 2)
            {
                if (i > 0) sb.Append(',');
                WriteString(sb, Convert.ToString(kv[i], CultureInfo.InvariantCulture));
                sb.Append(':');
                WriteValue(sb, kv[i + 1]);
            }
            return sb.Append('}').ToString();
        }

        static void WriteValue(StringBuilder sb, object v)
        {
            if (v == null) sb.Append("null");
            else if (v is bool) sb.Append((bool)v ? "true" : "false");
            else if (v is string) WriteString(sb, (string)v);
            else if (v is float) sb.Append(Num((double)(float)v));
            else if (v is double) sb.Append(Num((double)v));
            else if (v is IFormattable) sb.Append(((IFormattable)v).ToString(null, CultureInfo.InvariantCulture));
            else WriteString(sb, v.ToString());
        }

        static string Num(double d)
        {
            if (double.IsNaN(d) || double.IsInfinity(d)) return "0";
            return d.ToString("0.####", CultureInfo.InvariantCulture);
        }

        static void WriteString(StringBuilder sb, string s)
        {
            sb.Append('"');
            foreach (char c in s ?? "")
            {
                switch (c)
                {
                    case '"': sb.Append("\\\""); break;
                    case '\\': sb.Append("\\\\"); break;
                    case '\n': sb.Append("\\n"); break;
                    case '\r': sb.Append("\\r"); break;
                    case '\t': sb.Append("\\t"); break;
                    default:
                        if (c < 0x20) sb.Append("\\u").Append(((int)c).ToString("x4"));
                        else sb.Append(c);
                        break;
                }
            }
            sb.Append('"');
        }

        /// <summary>解析一層物件;失敗回 null。數字 → double、true/false → bool、字串 → string、null → null。</summary>
        public static Dictionary<string, object> Parse(string s)
        {
            if (s == null) return null;
            int i = 0;
            try
            {
                Skip(s, ref i);
                if (i >= s.Length || s[i] != '{') return null;
                i++;
                var d = new Dictionary<string, object>();
                Skip(s, ref i);
                if (i < s.Length && s[i] == '}') return d;
                while (true)
                {
                    Skip(s, ref i);
                    string key = ReadString(s, ref i);
                    Skip(s, ref i);
                    if (s[i++] != ':') return null;
                    Skip(s, ref i);
                    d[key] = ReadValue(s, ref i);
                    Skip(s, ref i);
                    char c = s[i++];
                    if (c == '}') return d;
                    if (c != ',') return null;
                }
            }
            catch (Exception)
            {
                return null;
            }
        }

        static void Skip(string s, ref int i)
        {
            while (i < s.Length && char.IsWhiteSpace(s[i])) i++;
        }

        static object ReadValue(string s, ref int i)
        {
            char c = s[i];
            if (c == '"') return ReadString(s, ref i);
            if (string.CompareOrdinal(s, i, "true", 0, 4) == 0) { i += 4; return true; }
            if (string.CompareOrdinal(s, i, "false", 0, 5) == 0) { i += 5; return false; }
            if (string.CompareOrdinal(s, i, "null", 0, 4) == 0) { i += 4; return null; }
            int st = i;
            while (i < s.Length && "+-0123456789.eE".IndexOf(s[i]) >= 0) i++;
            if (i == st) throw new FormatException("unsupported value");
            return double.Parse(s.Substring(st, i - st), NumberStyles.Float, CultureInfo.InvariantCulture);
        }

        static string ReadString(string s, ref int i)
        {
            if (s[i++] != '"') throw new FormatException("expected string");
            var sb = new StringBuilder();
            while (true)
            {
                char c = s[i++];
                if (c == '"') return sb.ToString();
                if (c != '\\') { sb.Append(c); continue; }
                char e = s[i++];
                switch (e)
                {
                    case 'n': sb.Append('\n'); break;
                    case 'r': sb.Append('\r'); break;
                    case 't': sb.Append('\t'); break;
                    case 'u': sb.Append((char)Convert.ToInt32(s.Substring(i, 4), 16)); i += 4; break;
                    default: sb.Append(e); break;
                }
            }
        }

        public static string Str(Dictionary<string, object> d, string k)
        {
            object v; return d != null && d.TryGetValue(k, out v) ? v as string : null;
        }

        public static double? Num(Dictionary<string, object> d, string k)
        {
            object v; return d != null && d.TryGetValue(k, out v) && v is double ? (double?)(double)v : null;
        }

        public static bool? Bool(Dictionary<string, object> d, string k)
        {
            object v; return d != null && d.TryGetValue(k, out v) && v is bool ? (bool?)(bool)v : null;
        }
    }
}
