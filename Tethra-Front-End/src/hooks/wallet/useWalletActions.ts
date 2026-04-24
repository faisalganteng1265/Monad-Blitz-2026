import { usePrivy } from '@privy-io/react-auth';
import { toast } from 'sonner';
import { useEmbeddedWallet } from '@/features/wallet/hooks/useEmbeddedWallet';

export const useWalletActions = () => {
  const { logout } = usePrivy();
  const { address } = useEmbeddedWallet();

  const handleCopyAddress = () => {
    if (address) {
      navigator.clipboard.writeText(address);
      toast.success('Address copied!');
    }
  };

  const handleViewExplorer = () => {
    if (address) {
      window.open(`https://testnet.monadexplorer.com/address/${address}`, '_blank');
    }
  };

  const handleDisconnect = () => {
    logout();
    toast.success('Wallet disconnected');
  };

  const shortAddress = address
    ? `${address.substring(0, 6)}...${address.substring(address.length - 4)}`
    : 'Connected';

  return {
    handleCopyAddress,
    handleViewExplorer,
    handleDisconnect,
    shortAddress,
  };
};
