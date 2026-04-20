function mapGuildRole(role) {
    return {
        roleId: role.id,
        name: role.name,
        color: role.color,
        position: role.position,
        discordPermissions: Number(role.permissions.bitfield.toString()),
    };
}

function mapGuildMember(member) {
    return {
        userId: member.user.id,
        username: member.user.username,
        globalName: member.user.globalName,
        avatarUrl: member.user.displayAvatarURL(),
        nickname: member.nickname,
        joinedAt: member.joinedAt ? member.joinedAt.toISOString() : null,
    };
}

function buildServerPayload(guild, owner) {
    return {
        name: guild.name,
        iconUrl: guild.iconURL(),
        ownerId: owner.user.id,
        ownerUsername: owner.user.username,
        ownerGlobalName: owner.user.globalName,
        ownerAvatarUrl: owner.user.displayAvatarURL(),
    };
}

module.exports = {
    mapGuildRole,
    mapGuildMember,
    buildServerPayload,
};
