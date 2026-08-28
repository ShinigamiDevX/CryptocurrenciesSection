export default function PasswordTips() {
    return (
        <div className="flex flex-col gap-2 pl-1 text-justify text-text-secondary">
            <span>Your new password should contain at least:</span>
            <p>
                <span className="font-bold">1 number</span>, <span className="font-bold">1 uppercase</span>,{" "}
                <span className="font-bold">1 lowercase</span>, <span className="font-bold">1 special character</span>{" "}
                and be at least <span className="font-bold">8 characters long</span>.
            </p>
            <p>
                The following special characters are allowed:
                <br />
                <span className="font-bold">
                    ^ $ * . [ ] {} ( ) ? - &quot; ! @ # % & / \ , &gt; &lt; &apos; : ; | _ ~ ` + =
                </span>
            </p>
        </div>
    );
}
