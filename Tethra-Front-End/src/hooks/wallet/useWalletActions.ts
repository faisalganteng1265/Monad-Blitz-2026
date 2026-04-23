import { usePrivy } from '@privy-io/react-auth';
import { toast } from 'sonner';
import { useEmbeddedWallet } from '@/features/wallet/hooks/useEmbeddedWallet';

export const useWalletActions = () => {
  const { exportWallet, logout } = usePrivy();
  const { address } = useEmbeddedWallet();

  const getEmbeddedWalletAddress = () => {
    return address;
  };

  const handleCopyAddress = () => {
    const address = getEmbeddedWalletAddress();
    if (address) {
      navigator.clipboard.writeText(address);
      toast.success('Address copied!');
    }
  };

  const handleViewExplorer = () => {
    const address = getEmbeddedWalletAddress();
    if (address) {
      window.open(`https://sepolia.basescan.org/address/${address}`, '_blank');
    }
  };

  const handleExportPrivateKey = async () => {
    try {
      if (!address) {
        toast.error('Embedded wallet address not found');
        return;
      }

      await exportWallet({ address });
      toast.success('Private key exported successfully!');
    } catch (error: any) {
      toast.error(error?.message || 'Failed to export private key');
    }
  };

  const handleDisconnect = () => {
    logout();
    toast.success('Wallet disconnected');
  };

  const shortAddress = (() => {
    const address = getEmbeddedWalletAddress();
    return address
      ? `${address.substring(0, 6)}...${address.substring(address.length - 4)}`
      : 'Connected';
  })();

  return {
    handleCopyAddress,
    handleViewExplorer,
    handleExportPrivateKey,
    handleDisconnect,
    shortAddress,
    getEmbeddedWalletAddress,
  };
};
