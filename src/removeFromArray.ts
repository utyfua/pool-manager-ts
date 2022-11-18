export function removeFromArray<T extends any = any>(target: T[], element: T): void{
    const index = target.indexOf(element)
    if (index !== -1) target.splice(index, 1);
}
