/**
 * @file Orb tab: the floating orb switch with what it does and the setup
 * checklist. Permissions are re-read whenever the
 * app returns to the foreground.
 */
import { BubbleCard } from '../../src/components/BubbleCard';
import { PermissionsCard } from '../../src/components/PermissionsCard';
import { Screen } from '../../src/components/Screen';
import { usePermissions } from '../../src/permissions';

/**
 * Orb screen.
 * @returns Switch and setup checklist.
 */
export default function BubbleScreen() {
  const permissions = usePermissions();
  return (
    <Screen title="Orb" subtitle="Your agent, one tap away in every app.">
      <BubbleCard status={permissions.status} refresh={permissions.refresh} />
      <PermissionsCard status={permissions.status} refresh={permissions.refresh} />
    </Screen>
  );
}
