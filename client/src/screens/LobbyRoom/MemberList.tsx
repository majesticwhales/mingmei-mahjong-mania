import type { LobbyMemberDto } from "../../wire/lobby";

interface Props {
  members: LobbyMemberDto[];
  hostUserId: string;
}

function memberRoleLabel(member: LobbyMemberDto, hostUserId: string): string {
  const isHost = member.userId === hostUserId;
  const teamLabel = member.teamSlot ? `Team ${member.teamSlot}` : null;

  if (isHost && teamLabel) return `HOST · ${teamLabel}`;
  if (isHost) return "HOST";
  return teamLabel ?? "—";
}

export function MemberList({ members, hostUserId }: Props) {
  return (
    <section>
      <h2 className="form__section-title">Members ({members.length})</h2>
      <ul className="member-list">
        {members.map((member) => (
          <li key={member.userId}>
            <span>@{member.username}</span>
            <span>{memberRoleLabel(member, hostUserId)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
