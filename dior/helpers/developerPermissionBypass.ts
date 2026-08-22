const developerPermissions = {
  has: () => true,
  missing: (): string[] => [],
  any: () => true,
  serialize: () => 'administrator',
};

function wrapMember(member: any): any {
  if (!member || typeof member !== 'object') return member;

  return new Proxy(member, {
    get(target, property, receiver) {
      if (property === 'permissions') return developerPermissions;
      return Reflect.get(target, property, receiver);
    },
  });
}

export function withDeveloperPermissionBypass<T extends object>(context: T, isDeveloper: boolean): T {
  if (!isDeveloper || !context || typeof context !== 'object') return context;

  const originalMember = Reflect.get(context, 'member');
  const developerMember = wrapMember(originalMember);

  return new Proxy(context, {
    get(target, property, receiver) {
      if (property === 'member') return developerMember;

      if (property === 'channel') {
        const channel = Reflect.get(target, property, receiver);
        if (!channel || typeof channel !== 'object') return channel;

        return new Proxy(channel, {
          get(channelTarget, channelProperty, channelReceiver) {
            if (channelProperty === 'permissionsFor') {
              return (member: any) =>
                member === originalMember || member === developerMember
                  ? developerPermissions
                  : (channelTarget as any).permissionsFor?.(member);
            }
            return Reflect.get(channelTarget, channelProperty, channelReceiver);
          },
        });
      }

      return Reflect.get(target, property, receiver);
    },
  });
}
