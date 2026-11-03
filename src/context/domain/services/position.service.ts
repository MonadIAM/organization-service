import { Inject, Injectable, Scope } from "@nestjs/common";
import { LockMode } from "@mikro-orm/core";

import { DEPARTMENT_REPOSITORY, TEAM_REPOSITORY } from "~context/infrastructure/repositories";
import { DepartmentStatus, TeamStatus, PositionReferenceType } from "~context/enums";

@Injectable({ scope: Scope.DEFAULT })
export class PositionService implements Services.Position.Contract {
    public constructor(
        @Inject(DEPARTMENT_REPOSITORY)
        private readonly departmentRepository: Repositories.Department.Contract,
        @Inject(TEAM_REPOSITORY)
        private readonly teamRepository: Repositories.Team.Contract,
    ) {}

    public async validatePlacement(
        props: Services.Position.ValidatePlacement.Props,
    ): Services.Position.ValidatePlacement.Result {
        const { transaction, input, realm } = props;

        await Promise.all([
            this.departmentRepository.findUniqueOrThrow({
                where: {
                    organization: { id: input.organization, realm },
                    status: DepartmentStatus.ACTIVE,
                    id: input.department,
                },
                options: { lockMode: LockMode.PESSIMISTIC_READ },
                transaction,
            }),
            this.teamRepository.findUniqueOrThrow({
                where: {
                    department: { id: input.department, organization: input.organization },
                    organization: input.organization,
                    status: TeamStatus.ACTIVE,
                    id: input.team,
                },
                options: { lockMode: LockMode.PESSIMISTIC_READ },
                transaction,
            }),
        ]);
    }

    public async completeReference(
        props: Services.Position.CompleteReference.Props,
    ): Services.Position.CompleteReference.Result {
        const { transaction, input, rejected } = props;

        switch (input.type) {
            case PositionReferenceType.DEPARTMENT_MANAGER: {
                const department = await this.departmentRepository.findUnique({
                    where: { id: input.department, organization: input.organization, process: input.process },
                    options: { lockMode: LockMode.PESSIMISTIC_WRITE, refresh: true },
                    transaction,
                });

                if (department) {
                    department.completePosition(rejected);
                }
                break;
            }
            case PositionReferenceType.TEAM_LEAD: {
                const team = await this.teamRepository.findUnique({
                    where: { id: input.team, organization: input.organization, process: input.process },
                    options: { lockMode: LockMode.PESSIMISTIC_WRITE, refresh: true },
                    transaction,
                });

                if (team) {
                    team.completePosition(rejected);
                }
                break;
            }
        }
    }

    public async release(props: Services.Position.Release.Props): Services.Position.Release.Result {
        const { transaction, input } = props;
        const [departments, teams] = await Promise.all([
            this.departmentRepository.find({
                where: {
                    organization: input.organization,
                    $or: [{ managerPosition: { $in: input.positions } }, { previousPosition: { $in: input.positions } }],
                },
                options: { lockMode: LockMode.PESSIMISTIC_WRITE, refresh: true },
                transaction,
            }),
            this.teamRepository.find({
                where: {
                    organization: input.organization,
                    $or: [{ leadPosition: { $in: input.positions } }, { previousPosition: { $in: input.positions } }],
                },
                options: { lockMode: LockMode.PESSIMISTIC_WRITE, refresh: true },
                transaction,
            }),
        ]);

        for (const department of departments) {
            department.releasePosition(input.positions);
        }

        for (const team of teams) {
            team.releasePosition(input.positions);
        }
    }
}
