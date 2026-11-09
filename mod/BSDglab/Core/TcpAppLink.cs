using System;
using System.Collections.Generic;
using System.Net.Sockets;
using System.Text;
using System.Threading;

namespace BSDglab.Core
{
    /// <summary>與 PC 程式的本機 TCP 連線(一行一個 JSON)。背景執行緒負責連線與自動重連。</summary>
    public sealed class TcpAppLink : IAppLink
    {
        readonly Func<string> host;
        readonly Func<int> port;
        readonly object wlock = new object();
        Thread thread;
        volatile bool running;
        volatile bool connected;
        TcpClient client;
        NetworkStream stream;

        public event Action Connected;
        public event Action Disconnected;
        public event Action<Dictionary<string, object>> Message;

        public TcpAppLink(Func<string> host, Func<int> port)
        {
            this.host = host;
            this.port = port;
        }

        public bool IsConnected { get { return connected; } }

        public void Start()
        {
            if (running) return;
            running = true;
            thread = new Thread(Loop) { IsBackground = true, Name = "BSDglab-link" };
            thread.Start();
        }

        void Loop()
        {
            while (running)
            {
                TcpClient c = null;
                bool wasConnected = false;
                try
                {
                    c = new TcpClient { NoDelay = true };
                    var ar = c.BeginConnect(host(), port(), null, null);
                    if (!ar.AsyncWaitHandle.WaitOne(1500) || !c.Connected)
                    {
                        try { c.Close(); } catch (Exception) { }
                        Thread.Sleep(2000);
                        continue;
                    }
                    c.EndConnect(ar);
                    lock (wlock) { client = c; stream = c.GetStream(); }
                    connected = true;
                    wasConnected = true;
                    Raise(Connected);
                    ReadLoop(c);
                }
                catch (Exception)
                {
                    // 連不上或中途斷線:下面統一收尾後重試
                }
                finally
                {
                    connected = false;
                    lock (wlock)
                    {
                        stream = null;
                        client = null;
                    }
                    try { if (c != null) c.Close(); } catch (Exception) { }
                    if (wasConnected) Raise(Disconnected);
                }
                if (running) Thread.Sleep(1000);
            }
        }

        void ReadLoop(TcpClient c)
        {
            var buf = new byte[4096];
            var sb = new StringBuilder();
            var s = c.GetStream();
            while (running)
            {
                int n = s.Read(buf, 0, buf.Length);
                if (n <= 0) return; // 對方關閉
                sb.Append(Encoding.UTF8.GetString(buf, 0, n));
                if (sb.Length > 1000000) return; // 異常資料
                string all = sb.ToString();
                int start = 0, nl;
                while ((nl = all.IndexOf('\n', start)) >= 0)
                {
                    string line = all.Substring(start, nl - start).Trim();
                    start = nl + 1;
                    if (line.Length == 0) continue;
                    var m = Json.Parse(line);
                    if (m != null) { var h = Message; if (h != null) { try { h(m); } catch (Exception) { } } }
                }
                sb.Clear();
                sb.Append(all.Substring(start));
            }
        }

        static void Raise(Action a)
        {
            if (a == null) return;
            try { a(); } catch (Exception) { }
        }

        public bool Send(string jsonLine)
        {
            lock (wlock)
            {
                if (stream == null) return false;
                try
                {
                    var b = Encoding.UTF8.GetBytes(jsonLine + "\n");
                    stream.Write(b, 0, b.Length);
                    return true;
                }
                catch (Exception)
                {
                    try { client.Close(); } catch (Exception) { } // 讓讀取執行緒收尾並重連
                    return false;
                }
            }
        }

        public void Dispose()
        {
            running = false;
            lock (wlock)
            {
                try { if (client != null) client.Close(); } catch (Exception) { }
            }
        }
    }
}
