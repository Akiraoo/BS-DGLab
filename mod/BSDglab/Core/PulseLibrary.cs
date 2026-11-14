using System;
using System.Collections.Generic;
using System.IO;
using System.Text;

namespace BSDglab.Core
{
    /// <summary>
    /// 導入的波形:郊狼 App 導出的 .pulse 檔,放在 Beat Saber\UserData\BSDglab\Waveforms\。
    /// mod 只負責讀檔、列名稱(檔名去掉 .pulse),內容原樣傳給 PC 程式解碼。
    /// </summary>
    public static class PulseLibrary
    {
        public const string KeyPrefix = "pulse:";
        const string Header = "Dungeonlab+pulse:";
        const long MaxBytes = 256 * 1024;

        public sealed class Item
        {
            public string Name;
            public string Data;
        }

        static List<Item> items = new List<Item>();

        /// <summary>目前讀到的波形(依檔名排序)</summary>
        public static IList<Item> Items { get { return items; } }

        /// <summary>資料夾路徑(Load 時設定)</summary>
        public static string Folder { get; private set; }

        /// <summary>重新掃描資料夾(不存在就建立)。回傳讀到幾個;壞掉的檔案記在 errors。</summary>
        public static int Load(string folder, List<string> errors = null)
        {
            Folder = folder;
            var list = new List<Item>();
            try
            {
                Directory.CreateDirectory(folder);
                foreach (var path in Directory.GetFiles(folder, "*.pulse"))
                {
                    try
                    {
                        if (new FileInfo(path).Length > MaxBytes) throw new Exception("file too large");
                        string text = File.ReadAllText(path, Encoding.UTF8).Trim().TrimStart('﻿');
                        if (!text.StartsWith(Header, StringComparison.Ordinal)) throw new Exception("not a DG-LAB .pulse file");
                        list.Add(new Item { Name = Path.GetFileNameWithoutExtension(path), Data = text });
                    }
                    catch (Exception e)
                    {
                        if (errors != null) errors.Add(Path.GetFileName(path) + ": " + e.Message);
                    }
                }
            }
            catch (Exception e)
            {
                if (errors != null) errors.Add(folder + ": " + e.Message);
            }
            list.Sort((a, b) => string.Compare(a.Name, b.Name, StringComparison.OrdinalIgnoreCase));
            items = list;
            return list.Count;
        }

        /// <summary>測試用:直接指定清單</summary>
        public static void Set(IEnumerable<Item> list)
        {
            items = new List<Item>(list);
        }

        public static bool IsKey(string key)
        {
            return key != null && key.StartsWith(KeyPrefix, StringComparison.OrdinalIgnoreCase);
        }

        public static string NameOf(string key)
        {
            return IsKey(key) ? key.Substring(KeyPrefix.Length) : key;
        }

        public static Item Find(string name)
        {
            foreach (var it in items) if (string.Equals(it.Name, name, StringComparison.OrdinalIgnoreCase)) return it;
            return null;
        }
    }
}
