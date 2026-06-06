import type { LobbyMemberDto } from "../../wire/lobby";

interface Props {
  members: LobbyMemberDto[];
  hostUserId: string;
}

export function MemberList({ members, hostUserId }: Props) {
  return (
    <section>
      <h2 className="form__section-title">Members ({members.length})</h2>
      <ul className="member-list">
        {members.map((member) => (
          <li key={member.userId}>
            <span>@{member.username}</span>
            <span>
              {member.userId === hostUserId ? "HOST" : member.teamSlot ? `Team ${member.teamSlot}` : "—"}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
