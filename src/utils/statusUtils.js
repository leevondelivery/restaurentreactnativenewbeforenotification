/**
 * Helper to parse boolean/string/number representation of active/isOpen/isAcceptingOrders status.
 * Handles explicit false representations like 'bfalse', 'false', '0', 'closed', 'inactive', 'no', 'off', 'offline'.
 * Handles explicit true representations like 'btrue', 'true', '1', 'open', 'active', 'yes', 'on', 'online', 'approved'.
 */
export const parseStatusValue = (val) => {
  if (val === undefined || val === null) return undefined;
  if (typeof val === 'boolean') return val;
  if (typeof val === 'number') return val === 1 || val > 0;
  if (typeof val === 'string') {
    const s = val.trim().toLowerCase();
    if (['false', 'bfalse', '0', 'closed', 'inactive', 'no', 'off', 'offline', 'b0'].includes(s)) {
      return false;
    }
    if (['true', 'btrue', '1', 'open', 'active', 'yes', 'on', 'online', 'approved', 'b1'].includes(s)) {
      return true;
    }
  }
  return undefined;
};

/**
 * Extracts restaurant active/open status safely from user or restaurant response object.
 * Returns boolean (true/false).
 */
export const extractIsActive = (rootObj) => {
  if (rootObj === undefined || rootObj === null) return false;

  const directVal = parseStatusValue(rootObj);
  if (directVal !== undefined) return directVal;

  if (typeof rootObj !== 'object') return false;

  // Specific entity sub-objects MUST be checked BEFORE top-level API wrappers
  // so top-level HTTP status strings (like status: "success" or status: 200) never override DB entity fields.
  const candidateObjs = [
    rootObj?.user,
    rootObj?.restaurant,
    rootObj?.restaurantDetails,
    rootObj?.user?.restaurant,
    rootObj?.user?.restaurantDetails,
    rootObj?.data,
    rootObj,
  ];

  const statusFields = [
    'isActive',
    'isActivestatus',
    'isActiveStatus',
    'is_active',
    'is_active_status',
    'isOpen',
    'is_open',
    'isAcceptingOrders',
    'is_accepting_orders',
    'isOpenToday',
    'isOpenNow',
    'restaurantStatus',
    'storeStatus',
    'activeStatus',
  ];

  // Inspect candidate objects for explicit operational status fields
  for (const obj of candidateObjs) {
    if (!obj || typeof obj !== 'object') continue;

    for (const field of statusFields) {
      if (obj[field] !== undefined && obj[field] !== null) {
        const parsed = parseStatusValue(obj[field]);
        if (parsed !== undefined) {
          return parsed;
        }
      }
    }
  }

  // Fallback if no operational status field is found
  return false;
};
