using Zenject;

namespace BSDglab.UI
{
    internal class MenuInstaller : Installer
    {
        public override void InstallBindings()
        {
            Container.BindInterfacesTo<SettingsController>().AsSingle();
        }
    }
}
