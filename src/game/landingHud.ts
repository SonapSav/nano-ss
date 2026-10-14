import { SERVICE_RADIUS, type Landing, type LandingEvent } from './landing';

/** Short notices for landing events. */
export function landingMessage(event: LandingEvent, landing: Landing): string {
  const t = landing.touchdown;
  const speed = t ? `${t.vertical.toFixed(1)} m/s` : '';
  switch (event) {
    case 'touchdown-safe':
      return `Touchdown at ${speed}: safe landing`;
    case 'touchdown-hard':
      return `Hard landing at ${speed}: legs damaged (another hard landing collapses them)`;
    case 'landed':
      return landing.servicePort
        ? `Landed on the ${landing.servicePort.title} pad: refuelling and repairing`
        : `Landed off the pad: no services (land within ${String(SERVICE_RADIUS)} m of a pad centre)`;
    case 'liftoff':
      return 'Lift-off';
    case 'serviced':
      return 'Refuelled and repaired';
  }
}

/** The LANDING line: contact, landed and service status, or leg damage; null when there is nothing to say. */
export function landingLine(landing: Landing): string | null {
  const legs = landing.legsDamaged ? '   LEGS DAMAGED' : '';
  if (landing.phase === 'landed') {
    const port = landing.servicePort;
    const service = port
      ? `${port.title} pad   ${landing.service < 1 ? `refuelling ${(landing.service * 100).toFixed(0)}%` : 'refuelled'}`
      : 'off pad, no services';
    return `LANDED   ${service}${legs}   throttle lifts off`;
  }
  if (landing.phase === 'contact') {
    const t = landing.touchdown;
    const last = t ? `   touchdown ${t.vertical.toFixed(1)} m/s ${t.verdict}` : '';
    return `CONTACT  ${String(landing.feet)}/4 feet${last}${legs}`;
  }
  return landing.legsDamaged ? 'LEGS     DAMAGED: repair at a spaceport pad' : null;
}
