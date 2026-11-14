using BeatSaberMarkupLanguage.Attributes;
using BSDglab.Core;

namespace BSDglab.UI
{
    /// <summary>設定頁每個標籤的文字(settings.bsml 用 ~t_xxx 綁定),跟著語言切換</summary>
    internal partial class SettingsController
    {
        static readonly string[] TextKeys = { "enabled", "cha", "chb", "wave", "wave_hint", "coef", "coef_hint", "heal", "heal_hint", "cap", "cap_hint", "rise", "fail", "zeropause", "nofail", "overlay", "edit", "edit_hint", "ox", "oy", "oz", "osize", "resethud", "estop", "resume", "lang", "lang_hint", "reloadwaves", "reloadwaves_hint" };

        [UIValue("t_enabled")] public string T_enabled { get { return L.T("enabled"); } }
        [UIValue("t_cha")] public string T_cha { get { return L.T("cha"); } }
        [UIValue("t_chb")] public string T_chb { get { return L.T("chb"); } }
        [UIValue("t_wave")] public string T_wave { get { return L.T("wave"); } }
        [UIValue("t_wave_hint")] public string T_wave_hint { get { return L.T("wave_hint"); } }
        [UIValue("t_coef")] public string T_coef { get { return L.T("coef"); } }
        [UIValue("t_coef_hint")] public string T_coef_hint { get { return L.T("coef_hint"); } }
        [UIValue("t_heal")] public string T_heal { get { return L.T("heal"); } }
        [UIValue("t_heal_hint")] public string T_heal_hint { get { return L.T("heal_hint"); } }
        [UIValue("t_cap")] public string T_cap { get { return L.T("cap"); } }
        [UIValue("t_cap_hint")] public string T_cap_hint { get { return L.T("cap_hint"); } }
        [UIValue("t_rise")] public string T_rise { get { return L.T("rise"); } }
        [UIValue("t_fail")] public string T_fail { get { return L.T("fail"); } }
        [UIValue("t_zeropause")] public string T_zeropause { get { return L.T("zeropause"); } }
        [UIValue("t_nofail")] public string T_nofail { get { return L.T("nofail"); } }
        [UIValue("t_overlay")] public string T_overlay { get { return L.T("overlay"); } }
        [UIValue("t_edit")] public string T_edit { get { return L.T("edit"); } }
        [UIValue("t_edit_hint")] public string T_edit_hint { get { return L.T("edit_hint"); } }
        [UIValue("t_ox")] public string T_ox { get { return L.T("ox"); } }
        [UIValue("t_oy")] public string T_oy { get { return L.T("oy"); } }
        [UIValue("t_oz")] public string T_oz { get { return L.T("oz"); } }
        [UIValue("t_osize")] public string T_osize { get { return L.T("osize"); } }
        [UIValue("t_resethud")] public string T_resethud { get { return L.T("resethud"); } }
        [UIValue("t_estop")] public string T_estop { get { return L.T("estop"); } }
        [UIValue("t_resume")] public string T_resume { get { return L.T("resume"); } }
        [UIValue("t_lang")] public string T_lang { get { return L.T("lang"); } }
        [UIValue("t_lang_hint")] public string T_lang_hint { get { return L.T("lang_hint"); } }

        [UIValue("t_reloadwaves")] public string T_reloadwaves { get { return L.T("reloadwaves", PulseLibrary.Items.Count); } }
        [UIValue("t_reloadwaves_hint")] public string T_reloadwaves_hint { get { return L.T("reloadwaves_hint"); } }

        void NotifyTexts()
        {
            foreach (var k in TextKeys) Notify("T_" + k);
            Notify("StatusText");
            Notify("Waveform");
        }
    }
}
