using Zenject;

namespace BSDglab.Game
{
    internal class GameInstaller : Installer
    {
        public override void InstallBindings()
        {
            Container.BindInterfacesTo<GameplayTracker>().AsSingle();
        }
    }
}
