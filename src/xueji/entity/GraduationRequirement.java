package xueji.entity;

/**
 * 毕业学分要求实体，对应数据库表 graduation_requirement。
 *
 * <p>每个系一条记录，表示该系毕业所需的总学分。学生端可通过
 * "已修学分 vs 要求学分"算出毕业差距（AI 层使用）。</p>
 */
public class GraduationRequirement {

    /** 系号（主键，外键）。 */
    private String deptId;

    /** 毕业所需总学分。 */
    private int requiredCredit;

    public GraduationRequirement() {
    }

    public GraduationRequirement(String deptId, int requiredCredit) {
        this.deptId = deptId;
        this.requiredCredit = requiredCredit;
    }

    public String getDeptId() {
        return deptId;
    }

    public void setDeptId(String deptId) {
        this.deptId = deptId;
    }

    public int getRequiredCredit() {
        return requiredCredit;
    }

    public void setRequiredCredit(int requiredCredit) {
        this.requiredCredit = requiredCredit;
    }

    @Override
    public String toString() {
        return deptId + "(" + requiredCredit + "学分)";
    }
}
