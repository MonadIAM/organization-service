import { SetMetadata } from "@nestjs/common";

import { REAUTHENTICATION } from "./tokens";

/** @public */
export function Reauthentication(options: Reauthentication.Options = {}): MethodDecorator {
    return SetMetadata(REAUTHENTICATION, options);
}
